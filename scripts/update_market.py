#!/usr/bin/env python3
"""Download a static Warframe Market snapshot (Python 3.10+, standard library only)."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import logging
import math
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
LOG = logging.getLogger('market')


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class Client:
    def __init__(self):
        self.lock = threading.Lock()
        self.next_request = 0.0

    def fetch(self, path):
        for attempt in range(3):
            with self.lock:
                time.sleep(max(0, self.next_request - time.monotonic()))
                self.next_request = time.monotonic() + 0.51
            try:
                request = Request('https://api.warframe.market/' + path,
                                  headers={'Accept': 'application/json', 'Platform': 'pc',
                                           'User-Agent': 'wf-syndicate-snapshot/1.0'})
                with urlopen(request, timeout=25) as response:
                    data = json.load(response)
                if data.get('error'):
                    raise ValueError(str(data['error']))
                return data
            except HTTPError as error:
                if error.code != 429 and error.code < 500:
                    raise
                delay = 2 ** (attempt + 1)
                if error.code == 429:
                    try:
                        delay = max(delay, float(error.headers.get('Retry-After', 5)))
                    except (ValueError, TypeError):
                        delay = max(delay, 5)
                    with self.lock:
                        self.next_request = max(self.next_request, time.monotonic() + delay)
                if attempt == 2:
                    raise
                time.sleep(delay)
            except (URLError, TimeoutError, OSError):
                if attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))


def parse_data(kind, payload):
    if kind == 'orders':
        orders = payload['data']['sell']
        if not isinstance(orders, list):
            raise ValueError('Invalid sell orders')
        value = orders[0]['platinum'] if orders else None
        if value is not None and (not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0):
            raise ValueError('Invalid platinum price')
        return value
    closed = payload['payload']['statistics_closed']
    result = {}
    for period in ('48hours', '90days'):
        points = closed[period]
        if not isinstance(points, list):
            raise ValueError('Invalid statistics')
        total = 0
        for point in points:
            volume = point['volume']
            if not isinstance(volume, (int, float)) or not math.isfinite(volume) or volume < 0:
                raise ValueError('Invalid volume')
            total += volume
        result[period] = total
    return result


def update_item(client, slug, old):
    record = dict(old)
    for kind in ('statistics', 'orders'):
        path = (f'v1/items/{slug}/statistics' if kind == 'statistics'
                else f'v2/orders/item/{slug}/top')
        try:
            record[kind] = parse_data(kind, client.fetch(path))
            record[kind + 'UpdatedAt'] = utc_now()
            record.pop(kind + 'Error', None)
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as error:
            # Keep the previous successful value and its timestamp on failure.
            record[kind + 'Error'] = str(error)
            LOG.warning('%s %s: %s', slug, kind, error)
    return slug, record


def atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.' + path.name, suffix='.tmp', delete=False) as stream:
            temp_path = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp_path, 0o644)
        temp_path.replace(path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def update(items_path, output_path):
    groups = json.loads(items_path.read_text(encoding='utf-8'))
    slugs = sorted({item['slug'] for group in groups.values() for item in group['favours']})
    if any(not re.fullmatch(r'[a-z0-9_]+', slug) for slug in slugs):
        raise ValueError('Invalid item slug')
    previous = {}
    if output_path.exists():
        previous = json.loads(output_path.read_text(encoding='utf-8')).get('items', {})
    snapshot = {'schemaVersion': 1, 'platform': 'pc', 'startedAt': utc_now(),
                'updatedAt': None, 'completedAt': None, 'total': len(slugs), 'processed': 0,
                'items': {slug: previous.get(slug, {}) for slug in slugs}}
    client = Client()
    pool = ThreadPoolExecutor(max_workers=4)
    try:
        futures = [pool.submit(update_item, client, slug, snapshot['items'][slug]) for slug in slugs]
        for count, future in enumerate(as_completed(futures), 1):
            slug, record = future.result()
            snapshot['items'][slug] = record
            snapshot['processed'] = count
            if count % 20 == 0 or count == len(slugs):
                snapshot['updatedAt'] = utc_now()
                atomic_write(output_path, snapshot)
                LOG.info('Saved %d/%d items', count, len(slugs))
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
    snapshot['updatedAt'] = snapshot['completedAt'] = utc_now()
    atomic_write(output_path, snapshot)
    failed = sum(any(kind + 'Error' in record for kind in ('statistics', 'orders'))
                 for record in snapshot['items'].values())
    LOG.info('Complete: %d items, %d with errors; %s', len(slugs), failed, output_path)
    return failed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--items', type=Path, default=ROOT / 'items.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'market-data.json')
    parser.add_argument('--watch', action='store_true', help='Update immediately, then repeat hourly')
    parser.add_argument('--interval', type=float, default=3600, help='Seconds between update starts (default: 3600)')
    args = parser.parse_args()
    if not math.isfinite(args.interval) or args.interval <= 0:
        parser.error('--interval must be positive and finite')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    try:
        while True:
            started = time.monotonic()
            try:
                failed = update(args.items, args.output)
            except (OSError, ValueError, KeyError, TypeError):
                LOG.exception('Update failed; the previous snapshot is preserved')
                if not args.watch:
                    return 1
            else:
                if not args.watch:
                    return 1 if failed else 0
            time.sleep(max(0, args.interval - (time.monotonic() - started)))
    except KeyboardInterrupt:
        LOG.info('Stopped')
        return 0


if __name__ == '__main__':
    raise SystemExit(main())

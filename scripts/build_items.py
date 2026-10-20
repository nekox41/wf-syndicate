#!/usr/bin/env python3
"""Clean the syndicate export and generate the tradeable allitems.json catalog."""

import argparse
from collections import defaultdict
from copy import deepcopy
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

from update_market import atomic_write

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ('name', 'description', 'colour', 'backgroundColour', 'favours')


def clean_export(export):
    return {key: {field: deepcopy(group[field]) for field in FIELDS if field in group}
            for key, group in export.items()}


def match_items(export, market):
    index = defaultdict(list)
    for item in market:
        if item.get('gameRef'):
            index[item['gameRef'].rsplit('/', 1)[-1]].append(item)
    result = deepcopy(export)
    removed = []
    retained = 0
    for key, group in result.items():
        favours = []
        for item in group.get('favours', []):
            ref = item['storeItem']
            matches = index.get(ref.rsplit('/', 1)[-1], [])
            if len(matches) > 1:
                normalized = ref.replace('/Lotus/StoreItems/', '/Lotus/', 1)
                matches = [entry for entry in matches if entry['gameRef'] == normalized]
                if len(matches) != 1:
                    raise ValueError(f'Ambiguous market match: {ref}')
            if not matches:
                removed.append({'syndicate': key, 'storeItem': ref})
                continue
            entry = matches[0]
            rank = entry.get('maxRank', 0)
            if not isinstance(rank, int) or isinstance(rank, bool) or rank < 0:
                raise ValueError(f'Invalid maxRank: {entry["slug"]}')
            item.update(slug=entry['slug'], i18n=deepcopy(entry['i18n']), maxRank=rank)
            favours.append(item)
            retained += 1
        group['favours'] = favours
    return result, {'retained': retained, 'removedCount': len(removed), 'removed': removed}


def translate_names(groups, names):
    for group in groups.values():
        path = group['name']
        if path.startswith('/'):
            value = names[path]
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f'Missing Chinese name: {path}')
            group['name'] = value


def build(args):
    export = clean_export(json.loads(args.export.read_text(encoding='utf-8')))
    # Keep the requested cleaned source export separate from the matched catalog.
    atomic_write(args.export, export)
    market = json.loads(args.market.read_text(encoding='utf-8'))
    catalog, report = match_items(export, market['data'] if isinstance(market, dict) else market)
    names = json.loads(args.names.read_text(encoding='utf-8')) if args.names.exists() else {}
    for path in dict.fromkeys(group['name'] for group in catalog.values()):
        if not path.startswith('/') or path in names:
            continue
        request = Request('https://browse.wf' + path, headers={'Accept': 'application/json', 'User-Agent': 'wf-syndicate/1.0'})
        with urlopen(request, timeout=30) as response:
            translated = json.load(response)
        names[path] = translated['zh']
        atomic_write(args.names, names)
        print(f'{path}: {names[path]}', flush=True)
        time.sleep(0.51)
    translate_names(catalog, names)
    atomic_write(args.output, catalog)
    atomic_write(args.report, report)
    unique = {item['slug'] for group in catalog.values() for item in group['favours']}
    print(f'Saved {len(catalog)} groups, {report["retained"]} offers, {len(unique)} unique items; removed {report["removedCount"]}.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', type=Path, default=ROOT / 'ExportSyndicates.json')
    parser.add_argument('--market', type=Path, default=ROOT / 'items.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'allitems.json')
    parser.add_argument('--names', type=Path, default=ROOT / 'syndicate-names.json')
    parser.add_argument('--report', type=Path, default=ROOT / 'items-match-report.json')
    build(parser.parse_args())


if __name__ == '__main__':
    main()

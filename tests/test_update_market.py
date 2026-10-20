import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('update_market', Path(__file__).resolve().parents[1] / 'scripts/update_market.py')
market = importlib.util.module_from_spec(spec)
spec.loader.exec_module(market)


class MarketTests(unittest.TestCase):
    def test_statistics_sums_both_periods(self):
        payload = {'payload': {'statistics_closed': {
            '48hours': [{'volume': 3}, {'volume': 7}], '90days': [{'volume': 60}]}}}
        self.assertEqual(market.parse_data('statistics', payload), {'48hours': 10, '90days': 60})
        payload['payload']['statistics_closed']['48hours'][0]['volume'] = -1
        with self.assertRaises(ValueError):
            market.parse_data('statistics', payload)

    def test_first_order_and_no_orders(self):
        self.assertEqual(market.parse_data('orders', {'data': {'sell': [{'platinum': 30}, {'platinum': 20}]}}), 30)
        self.assertIsNone(market.parse_data('orders', {'data': {'sell': []}}))

    def test_failure_preserves_previous_value_and_success_clears_error(self):
        class Client:
            def fetch(self, path):
                if 'statistics' in path:
                    raise OSError('offline')
                return {'data': {'sell': []}}
        old = {'statistics': {'48hours': 5, '90days': 50}, 'statisticsUpdatedAt': 'old', 'orders': 20, 'ordersError': 'previous failure'}
        _, record = market.update_item(Client(), 'alpha', old)
        self.assertEqual(record['statistics'], old['statistics'])
        self.assertEqual(record['statisticsUpdatedAt'], 'old')
        self.assertIn('statisticsError', record)
        self.assertIsNone(record['orders'])
        self.assertNotIn('ordersError', record)
        self.assertEqual(old['orders'], 20)

    def test_update_deduplicates_and_writes_valid_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / 'items.json', root / 'market.json'
            source.write_text(json.dumps({'A': {'favours': [{'slug': 'alpha'}]}, 'B': {'favours': [{'slug': 'alpha'}]}}))
            def fetch(client, path):
                if 'statistics' in path:
                    return {'payload': {'statistics_closed': {'48hours': [], '90days': []}}}
                return {'data': {'sell': [{'platinum': 25}]}}
            with patch.object(market.Client, 'fetch', autospec=True, side_effect=fetch) as request:
                self.assertEqual(market.update(source, output), 0)
                self.assertEqual(request.call_count, 2)
            result = json.loads(output.read_text())
            self.assertEqual(result['total'], 1)
            self.assertEqual(result['processed'], 1)
            self.assertIsNotNone(result['completedAt'])
            self.assertEqual(result['items']['alpha']['orders'], 25)
            self.assertEqual(list(root.glob('*.tmp')), [])

    def test_shared_rate_limit_including_retry(self):
        clock = [0.0]
        starts = []
        def sleep(seconds):
            clock[0] += seconds
        def fetch(request, timeout):
            starts.append(clock[0])
            if len(starts) == 1:
                raise HTTPError(request.full_url, 429, 'limit', {'Retry-After': '3'}, None)
            return io.BytesIO(b'{"data": {}}')
        with patch.object(market.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(market.time, 'sleep', side_effect=sleep), patch.object(market, 'urlopen', side_effect=fetch):
            client = market.Client()
            client.fetch('v1/items/alpha/statistics')
            client.fetch('v2/orders/item/alpha/top')
        self.assertGreaterEqual(starts[1] - starts[0], 3)
        self.assertGreaterEqual(starts[2] - starts[1], 0.5)

    def test_watch_runs_hourly_without_overlapping_rounds(self):
        with patch('sys.argv', ['update_market.py', '--watch']), patch.object(market, 'update', return_value=0) as update, patch.object(market.time, 'monotonic', side_effect=[100, 150]), patch.object(market.time, 'sleep', side_effect=KeyboardInterrupt) as sleep:
            self.assertEqual(market.main(), 0)
            update.assert_called_once()
            sleep.assert_called_once_with(3550)

    def test_failed_serialization_does_not_replace_previous_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snapshot.json'
            path.write_text('{"previous": true}')
            with self.assertRaises(ValueError):
                market.atomic_write(path, {'bad': float('nan')})
            self.assertEqual(json.loads(path.read_text()), {'previous': True})
            self.assertEqual(len(list(Path(directory).iterdir())), 1)


if __name__ == '__main__':
    unittest.main()

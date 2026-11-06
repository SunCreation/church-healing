import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('monitor_render', Path(__file__).resolve().parents[1] / 'scripts/monitor-render.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class MonitorTest(unittest.TestCase):
    def test_health_url_becomes_site_root(self):
        self.assertEqual(monitor.base_url('https://example.invalid/api/health'), 'https://example.invalid/')

    def test_local_test_url(self):
        self.assertEqual(monitor.base_url('http://localhost:8788/'), 'http://localhost:8788/')

    def test_unsafe_or_mistyped_urls(self):
        for url in ['', 'http://example.invalid/', 'https://u:p@example.invalid/',
                    'https://example.invalid/?token=1', 'https://example.invalid/#x', 'https://example.invalid/admin']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                monitor.base_url(url)

    def test_actual_position_updates(self):
        result = monitor.movement_result({'x': 0, 'z': 10.5},
            [{'x': 0, 'z': 10, 'moving': True}], [{'rot': 3.14}, {'rot': 3.3}])
        self.assertEqual(result['moved_metres'], 0.5)

    def test_no_movement_or_no_rotation_fails(self):
        with self.assertRaises(AssertionError):
            monitor.movement_result({'x': 0, 'z': 0}, [{'x': 0, 'z': 0, 'moving': False}], [{'rot': 0}, {'rot': 1}])
        with self.assertRaises(AssertionError):
            monitor.movement_result({'x': 0, 'z': 0}, [{'x': 1, 'z': 0, 'moving': True}], [{'rot': 0}])

    def test_empty_updates_fail(self):
        with self.assertRaises(AssertionError):
            monitor.movement_result({'x': 0, 'z': 0}, [], [])

    def test_one_slow_ci_frame_uses_pre_turn_baseline(self):
        result = monitor.movement_result({'x': 0, 'z': 0},
            [{'x': 1, 'z': 0, 'moving': True}], [{'rot': 3.14}, {'rot': 3.26}])
        self.assertGreater(result['turned_radians'], 0.05)


if __name__ == '__main__':
    unittest.main()

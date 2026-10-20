import importlib.util
from pathlib import Path
import sys
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location('build_items', SCRIPTS / 'build_items.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildTests(unittest.TestCase):
    def test_cleans_groups_and_preserves_offer_fields(self):
        source = {'A': {'name': '/A', 'description': 'text', 'colour': {'value': '0x00112233'},
                        'backgroundColour': {'value': '0x00445566'}, 'icon': 'remove',
                        'favours': [{'storeItem': '/Lotus/StoreItems/Mods/Alpha', 'standingCost': 100}]}}
        cleaned = build.clean_export(source)
        self.assertNotIn('icon', cleaned['A'])
        market = [{'gameRef': '/Lotus/Mods/Alpha', 'slug': 'alpha', 'i18n': {'en': {'name': 'Alpha'}}}]
        output, report = build.match_items(cleaned, market)
        self.assertEqual(output['A']['favours'][0]['maxRank'], 0)
        self.assertEqual(output['A']['favours'][0]['standingCost'], 100)
        self.assertEqual(report['retained'], 1)
        self.assertNotIn('slug', source['A']['favours'][0])
        build.translate_names(output, {'/A': '集团甲'})
        self.assertEqual(output['A']['name'], '集团甲')

    def test_same_tail_disambiguated_by_full_path_and_unmatched_removed(self):
        source = {'A': {'name': '/A', 'favours': [
            {'storeItem': '/Lotus/StoreItems/Mods/Rifle/Alpha'}, {'storeItem': '/Missing'}]}}
        market = [
            {'gameRef': '/Lotus/Mods/Pistol/Alpha', 'slug': 'pistol', 'i18n': {}, 'maxRank': 3},
            {'gameRef': '/Lotus/Mods/Rifle/Alpha', 'slug': 'rifle', 'i18n': {}, 'maxRank': 5}]
        output, report = build.match_items(source, market)
        self.assertEqual(len(output['A']['favours']), 1)
        self.assertEqual(output['A']['favours'][0]['slug'], 'rifle')
        self.assertEqual(output['A']['favours'][0]['maxRank'], 5)
        self.assertEqual(report['removedCount'], 1)

    def test_unresolved_collision_is_not_silently_assigned(self):
        source = {'A': {'favours': [{'storeItem': '/Lotus/StoreItems/Other/Alpha'}]}}
        with self.assertRaises(ValueError):
            build.match_items(source, [{'gameRef': '/A/Alpha'}, {'gameRef': '/B/Alpha'}])


if __name__ == '__main__':
    unittest.main()

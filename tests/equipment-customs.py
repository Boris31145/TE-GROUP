"""Financial regression cases for the published, dated customs scenarios."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("customs", ROOT / "scripts/equipment-customs.py")
customs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(customs)
D = customs.D


class CustomsTests(unittest.TestCase):
    def test_loader_us_duty_and_power_range(self):
        common = dict(rate=".30", util_base=172500)
        low = customs.estimate(5811430, **common, util_coefficient="26.45")
        high = customs.estimate(5811430, **common, util_coefficient="39.68")
        self.assertEqual(low["duty_rub"], "1743429.00")
        self.assertEqual(low["vat_rub"], "1662068.98")
        self.assertEqual(low["equipment_with_customs_rub"], "13828792.98")
        self.assertEqual(high["equipment_with_customs_rub"], "16110967.98")

    def test_second_loader(self):
        c = customs.estimate(5853239, rate=".30", util_base=172500, util_coefficient="26.45")
        self.assertEqual(c["equipment_with_customs_rub"], "13895102.05")

    def test_excavator_2026_category(self):
        c = customs.estimate(5613750, rate=".05", util_base=172500, util_coefficient="48.78")
        self.assertEqual(c["recycling_fee_rub"], "8414550.00")
        self.assertEqual(c["equipment_with_customs_rub"], "15655003.75")

    def test_old_road_trucks_engine_volume_duty(self):
        for cm3, duty, total in [(12900, "1208971.23", "18093173.12"),
                                 (12800, "1199599.36", "18081739.44")]:
            c = customs.estimate(5435151, cm3=cm3, eur="93.7187", util_base=150000, util_coefficient="66.44")
            self.assertEqual(c["duty_rub"], duty)
            self.assertEqual(c["recycling_fee_rub"], "9966000.00")
            self.assertEqual(c["equipment_with_customs_rub"], total)

    def test_freight_affects_tax_base_and_fee_threshold(self):
        kw = dict(cm3=12900, eur="93.7187", util_base=150000, util_coefficient="66.44")
        a = customs.estimate(5435151, **kw)
        b = customs.estimate(5435151, **kw, border_transport=100000)
        self.assertEqual(a["duty_rub"], b["duty_rub"])
        self.assertEqual(D(b["vat_rub"]) - D(a["vat_rub"]), D("22000"))
        self.assertEqual(b["clearance_fee_rub"], "49240.00")
        self.assertEqual(D(b["customs_total_rub"]) - D(a["customs_total_rub"]), D("49896"))

    def test_ad_valorem_freight(self):
        c = customs.estimate(5613750, rate=".05", util_base=172500, util_coefficient="48.78", border_transport=100000)
        self.assertEqual(c["duty_rub"], "285687.50")
        self.assertEqual(c["vat_rub"], "1319876.25")

    def test_fee_boundaries(self):
        self.assertEqual(customs.clearance_fee(D("5500000")), 21344)
        self.assertEqual(customs.clearance_fee(D("5500000.01")), 49240)
        self.assertEqual(customs.clearance_fee(D("10000000.01")), 73860)

    def test_no_double_duty_or_negative_values(self):
        kw = dict(util_base=172500, util_coefficient="26.45")
        with self.assertRaises(ValueError):
            customs.estimate(1, rate=".30", cm3=1, **kw)
        with self.assertRaises(ValueError):
            customs.estimate(1, rate=".30", border_transport=-1, **kw)

    def test_published_breakdowns_and_assumptions(self):
        data = json.loads((ROOT / "equipment/listings.json").read_text())
        page = (ROOT / "equipment/index.html").read_text()
        self.assertEqual(len(data["items"]), 5)
        for item in data["items"]:
            c = item["customs"]
            parts = sum(D(c[k]) for k in ("duty_rub", "vat_rub", "clearance_fee_rub", "recycling_fee_rub"))
            self.assertEqual(parts, D(c["customs_total_rub"]))
            self.assertEqual(D(item["price_rub"]) + parts, D(c["equipment_with_customs_rub"]))
            self.assertFalse(c["border_transport_included"])
            self.assertEqual(c["status"], "preliminary_scenario")
            self.assertTrue(c["assumptions"])
            self.assertIn(item["serial"], page)
        self.assertEqual(page.count('class="customs-details"'), 5)
        self.assertNotIn("Отдельный расчёт</dd>", page)


if __name__ == "__main__":
    unittest.main()

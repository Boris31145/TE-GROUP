"""Rebuild the dated, preliminary RF import estimates in the equipment catalogue.

No logistics quote or document verification is implied. All assumptions and source
links are published with the figures. Uses Decimal; never derives tax from markup.
"""
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1]
D = Decimal
CENT = D(".01")
VAT = D(".22")
DATE = "2026-10-19"


def money(value):
    return D(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def clearance_fee(value):
    for limit, fee in [(200000, 1231), (450000, 2462), (1200000, 4924),
                       (2700000, 13541), (4200000, 18465), (5500000, 21344),
                       (10000000, 49240)]:
        if value <= limit:
            return D(fee)
    return D(73860)


def estimate(price, *, rate=None, cm3=None, eur=None, util_base,
             util_coefficient, border_transport=0):
    """One machine/one declaration, commercial import; no reliefs or excise.

    border_transport is zero only for the explicitly logistics-excluded scenario.
    Actual freight/insurance to the EAEU entry point must be added to customs value.
    """
    if (rate is None) == (cm3 is None):
        raise ValueError("Choose either an ad-valorem or an engine-volume duty")
    if D(str(price)) < 0 or D(str(border_transport)) < 0:
        raise ValueError("Negative customs value")
    value = money(D(str(price)) + D(str(border_transport)))
    duty = money(value * D(str(rate)) if rate is not None
                 else D(str(cm3)) * D(str(eur)))
    vat = money((value + duty) * VAT)
    fee = clearance_fee(value)
    recycling = money(D(str(util_base)) * D(str(util_coefficient)))
    payments = money(duty + vat + fee + recycling)
    return {k: str(money(v)) for k, v in {
        "customs_value_rub": value, "duty_rub": duty, "vat_rub": vat,
        "clearance_fee_rub": fee, "recycling_fee_rub": recycling,
        "customs_total_rub": payments,
        "equipment_with_customs_rub": D(str(price)) + payments,
    }.items()}


SOURCES = {
    "tariff84": {"title": "ЕТТ ЕАЭС, группа 84 (действующая редакция)", "url": "https://eec.eaeunion.org/comission/department/catr/ett/ru.2022/ru.84_2022_27.04.2026.pdf"},
    "tariff87": {"title": "ЕТТ ЕАЭС, группа 87 (действующая редакция)", "url": "https://eec.eaeunion.org/comission/department/catr/ett/ru.2022/ru.87_2022_22.01.2026.pdf"},
    "usa_duty": {"title": "ПП РФ № 2240: пошлина 30% на погрузчики происхождением из США", "url": "http://government.ru/docs/all/144700/?page=8"},
    "util81": {"title": "ПП РФ № 81: утильсбор на самоходные машины, таблица 2026", "url": "http://government.ru/docs/all/105365/?page=5"},
    "util81_loaders": {"title": "ПП РФ № 81: категории F04 и F05", "url": "http://government.ru/docs/all/105365/?page=6"},
    "util_trucks": {"title": "ПП РФ № 1065: строка 18¹ для самосвалов свыше 20 т", "url": "http://government.ru/docs/all/160051/"},
    "clearance": {"title": "ПП РФ № 1637 в редакции № 1638: таможенный сбор", "url": "http://government.ru/docs/all/156477/"},
    "vat": {"title": "ФНС: основная ставка НДС 22% с 2026 года", "url": "https://www.nalog.gov.ru/rn25/news/activities_fts/16590316/"},
    "cat_power": {"title": "Caterpillar 950M: 171 кВт net / 186 кВт ISO 14396", "url": "https://www.petersoncat.com/sites/default/files/products/documents/-79541.pdf"},
    "hyundai_power": {"title": "Hyundai HX380L: мощность 257 кВт", "url": "https://www.hyundai-ce.eu/en/products/archive/excavators/crawler-excavators/hx380l"},
    "paccar": {"title": "PACCAR MX-13: номинальный рабочий объём 12,9 л", "url": "https://paccarpowertrain.com/wp-content/uploads/2024/04/CARB-MY24-_MX13SpecSheet_2025.pdf"},
    "detroit": {"title": "Detroit DD13: номинальный рабочий объём 12,8 л", "url": "https://www.detroitanz.com/engines/dd13/"},
}


def fmt(value):
    return f"{money(value):,.0f}".replace(",", "\u00a0") + "\u00a0₽"


def millions(value):
    return str((D(value) / 1000000).quantize(D(".01"), rounding=ROUND_HALF_UP)).replace(".", ",")


def link(source):
    s = SOURCES[source]
    return f'<a href="{html.escape(s["url"], quote=True)}" target="_blank" rel="noopener noreferrer">{html.escape(s["title"])} ↗</a>'


def rebuild():
    path = ROOT / "equipment/listings.json"
    data = json.loads(path.read_text())
    for item in data["items"]:
        cat = item["id"].startswith("cat-950m")
        excavator = item["id"] == "hyundai-hx380l"
        if cat:
            args = {"rate": ".30", "util_base": 172500, "util_coefficient": "26.45"}
            assumptions = [
                "Расчёт для происхождения США: пошлина 30% по ПП РФ № 2240. Страна размещения объявления сама по себе не подтверждает происхождение; нужен документ продавца.",
                "Утильсбор показан диапазоном: F04 (200–250 л.с.) — 4 562 625 ₽; F05 (250–300 л.с.) — 6 844 800 ₽. У модели указаны 171 кВт net и 186 кВт ISO 14396; номинальную мощность и категорию необходимо подтвердить по табличке двигателя и документам конкретной машины.",
            ]
            code, origin, category = "8429519900", "США — расчётное допущение, требует подтверждения", "F04–F05, старше 3 лет"
            sources = ["tariff84", "usa_duty", "util81_loaders", "cat_power"]
        elif excavator:
            args = {"rate": ".05", "util_base": 172500, "util_coefficient": "48.78"}
            assumptions = ["Принято происхождение Республика Корея, мощность 257 кВт и возраст более 3 лет: категория C03. Происхождение и мощность проверяются по документам конкретной машины."]
            code, origin, category = "8429521001", "Республика Корея — требует подтверждения по документам", "C03, старше 3 лет"
            sources = ["tariff84", "util81", "hyundai_power"]
        else:
            cm3 = 12900 if item["id"] == "peterbilt-365" else 12800
            args = {"cm3": cm3, "eur": str(data["rates"]["EUR"]), "util_base": 150000, "util_coefficient": "66.44"}
            engine = "PACCAR MX-13, 12 900 см³" if cm3 == 12900 else "Detroit DD13, 12 800 см³"
            assumptions = [
                f"Для пошлины принят номинальный объём двигателя {engine}. Точный объём в см³ необходимо сверить с документами: 1 EUR за 1 см³ для дорожного дизельного грузовика старше 7 лет и полной массой более 20 т.",
                "Принята категория дорожного самосвала полной массой более 20 т, старше 3 лет: строка 18¹ ПП РФ № 1291, коэффициент 66,44 на 2026 год. Это не карьерный самосвал категории R по ПП РФ № 81.",
            ]
            code, origin, category = "8704239801", "США", "18¹, дорожный самосвал свыше 20 т, старше 3 лет"
            sources = ["tariff87", "util_trucks", "paccar" if cm3 == 12900 else "detroit"]
        calculation = estimate(item["price_rub"], **args)
        upper = estimate(item["price_rub"], **{**args, "util_coefficient": "39.68"}) if cat else calculation
        item["customs"] = {
            "calculated_on": DATE, "status": "preliminary_scenario", "destination": "Россия",
            "importer": "Юридическое лицо / ИП", "declarations": "Одна машина в отдельной декларации",
            "tnved_provisional": code, "origin_assumption": origin, "recycling_category": category,
            "vat_rate": str(VAT), "excise_rub": "0.00", "inputs": args,
            "border_transport_included": False, "assumptions": assumptions,
            "sources": sources + ["clearance", "vat"],
            **calculation,
            "customs_total_max_rub": upper["customs_total_rub"],
            "equipment_with_customs_max_rub": upper["equipment_with_customs_rub"],
            "recycling_fee_max_rub": upper["recycling_fee_rub"],
        }
        item["customs_status"] = "Предварительный расчёт опубликован; без логистики и услуг"
    data["customs_method"] = {
        "date": DATE, "sources": SOURCES,
        "customs_value": "Цена продавца в рублях. Перевозка, страхование и иные добавления до места прибытия в ЕАЭС в этом сценарии не учтены; при выборе маршрута их необходимо включить в таможенную стоимость.",
        "vat_formula": "22% × (таможенная стоимость + пошлина); утильсбор и таможенный сбор в базу НДС не включены",
        "total_formula": "Цена техники + пошлина + ввозной НДС + таможенный сбор + утилизационный сбор",
        "excluded": ["Перевозка", "Страхование", "Услуги брокера и TE GROUP", "СВХ", "Сертификация и оформление ПСМ/ЭПТС"],
        "rounding": "Каждый платёж округлён до копеек ROUND_HALF_UP; суммы на странице отображаются в рублях/млн рублей",
    }
    data["pricing_model"] = "Опубликованы цена продавца, предварительные платежи при ввозе в РФ и итог техника + таможня и утильсбор. Доставка и услуги отдельно; транспортная составляющая таможенной стоимости требует пересчёта после выбора маршрута."
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

    page = ROOT / "equipment/index.html"
    text = page.read_text()
    for item in data["items"]:
        c = item["customs"]
        ranged = c["equipment_with_customs_rub"] != c["equipment_with_customs_max_rub"]
        total = millions(c["equipment_with_customs_rub"])
        if ranged:
            total += "–" + millions(c["equipment_with_customs_max_rub"])
        customs = fmt(c["customs_total_rub"])
        util = fmt(c["recycling_fee_rub"])
        exact = fmt(c["equipment_with_customs_rub"])
        if ranged:
            customs += " – " + fmt(c["customs_total_max_rub"])
            util += " – " + fmt(c["recycling_fee_max_rub"])
            exact += " – " + fmt(c["equipment_with_customs_max_rub"])
        small = "Диапазон зависит от мощности в документах." if ranged else "Расчётный ориентир на 19.10.2026."
        rows = [("Техника у продавца", fmt(item["price_rub"])), ("Таможня и утильсбор ≈", customs), ("Доставка", "Отдельно по запросу")]
        detail_rows = [("Техника у продавца", fmt(item["price_rub"])), ("Пошлина · " + ("30%" if item["id"].startswith("cat") else "5%" if item["id"].startswith("hyundai") else "1 EUR/см³"), fmt(c["duty_rub"])), ("Ввозной НДС · 22%", fmt(c["vat_rub"])), ("Таможенный сбор", fmt(c["clearance_fee_rub"])), ("Утилизационный сбор", util), ("Итого без доставки ≈", exact)]
        def dl(rows, cls):
            return f'<dl class="{cls}">' + ''.join(f'<div><dt>{html.escape(k)}</dt><dd>{html.escape(v)}</dd></div>' for k, v in rows) + '</dl>'
        price_html = f'<div class="machine-price"><small>Техника + таможня и утильсбор ≈</small><strong>{total} млн ₽</strong><span>Без доставки и услуг. {small}</span></div>' + dl(rows, "machine-costs")
        details = '<details class="customs-details"><summary>Расчёт таможни и условия</summary>' + dl(detail_rows, "customs-breakdown")
        details += f'<p>Ввоз в РФ для юридического лица / ИП. Предварительный код ТН ВЭД: <b>{c["tnved_provisional"]}</b>. НДС не уменьшен на возможный вычет.</p>'
        details += ''.join(f'<p>{html.escape(a)}</p>' for a in c['assumptions'])
        details += '<p>Расчёт от цены продавца без логистики. Фактические расходы до границы ЕАЭС увеличат базу пошлины и НДС. Итог уточняется по документам и курсу на дату декларации; льготы не применены.</p><p>Источники: ' + ' · '.join(link(s) for s in c['sources']) + '</p></details>'
        pattern = rf'(<article\b[^>]*\bid="{re.escape(item["id"])}"[^>]*>)(.*?)(</article>)'
        def replace_card(match):
            body = re.sub(r'<details class="customs-details">.*?</details>', '', match[2], flags=re.S)
            body, n = re.subn(r'<div class="machine-price">.*?</div><dl class="machine-costs">.*?</dl>', lambda _: price_html + details, body, count=1, flags=re.S)
            if n != 1:
                raise ValueError("Price block not found: " + item['id'])
            return match[1] + body + match[3]
        text, n = re.subn(pattern, replace_card, text, count=1, flags=re.S)
        if n != 1:
            raise ValueError("Missing machine: " + item['id'])
    text = text.replace('equipment.css?v=20261019-2', 'equipment.css?v=20261019-3')
    text = text.replace('цена техники за единицу', 'цена техники у продавца')
    text = re.sub(r'(<meta name="description" content=")[^"]*', r'\g<1>Фронтальные погрузчики, экскаватор и самосвалы с VIN и заводскими номерами. Предварительная стоимость техники с пошлиной, НДС и утильсбором. Доставка отдельно.', text, count=1)
    text = re.sub(r'<aside class="budget-note">.*?</aside>', '''<aside class="budget-note"><strong>Техника + таможня и утильсбор. Доставка — отдельно.</strong><p>В карточках — предварительный расчёт ввоза в Россию для юридического лица / ИП на 19.10.2026: цена машины, пошлина, НДС 22%, таможенный и утилизационный сборы. Подробная разбивка и допущения доступны в каждой карточке.</p><p>Доставка, страхование, услуги брокера, СВХ, сертификация и ПСМ/ЭПТС не включены. После выбора маршрута расходы до границы ЕАЭС добавляются в таможенную стоимость, поэтому платежи пересчитываются. Это ориентир бюджета, а не фиксированная цена ввоза.</p><small>Курс ЦБ на 17.10.2026, действующий 19.10.2026: 1 USD = 83,6177 ₽; 1 EUR = 93,7187 ₽. <a href="https://www.cbr.ru/currency_base/daily/?UniDbQuery.Posted=True&amp;UniDbQuery.To=19.10.2026" target="_blank" rel="noopener noreferrer">Источник курса ↗</a></small></aside>''', text, count=1, flags=re.S)
    text = text.replace('Рассчитать технику и таможню <span>', 'Уточнить расчёт и доставку <span>')
    page.write_text(text)
    for i in data["items"]:
        c = i["customs"]
        print(i["id"], c["customs_total_rub"], c["equipment_with_customs_rub"], c["equipment_with_customs_max_rub"])


if __name__ == "__main__":
    rebuild()

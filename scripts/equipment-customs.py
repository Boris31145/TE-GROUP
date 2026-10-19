"""Rebuild the dated, preliminary RF import estimates in the equipment catalogue.

No logistics quote or document verification is implied. Costing assumptions are retained in internal research records. Uses Decimal; never derives tax from markup.
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
    "tariff84": {"title": "ЕТТ ЕАЭС, группа 84", "url": "https://eec.eaeunion.org/comission/department/catr/ett/ru.2022/ru.84_2022_27.04.2026.pdf"},
    "util81": {"title": "ПП РФ № 81: экскаваторы, таблица 2026", "url": "https://government.ru/docs/all/105365/?page=5"},
    "util81_loaders": {"title": "ПП РФ № 81: погрузчики F03, таблица 2026", "url": "https://government.ru/docs/all/105365/?page=6"},
    "clearance": {"title": "ПП РФ № 1637: таможенный сбор", "url": "https://government.ru/docs/all/156477/"},
    "vat": {"title": "ФНС: НДС 22% с 2026 года", "url": "https://www.nalog.gov.ru/rn25/news/activities_fts/16590316/"},
}


def fmt(value):
    return f"{money(value):,.0f}".replace(",", "\u00a0") + "\u00a0₽"


def millions(value):
    return str((D(value) / 1000000).quantize(D(".01"), rounding=ROUND_HALF_UP)).replace(".", ",")


def link(source):
    s = SOURCES[source]
    return f'<a href="{html.escape(s["url"], quote=True)}" target="_blank" rel="noopener noreferrer">{html.escape(s["title"])} ↗</a>'



def calculate_item(item, rates):
    if item["pricing_mode"] == "russia_resale":
        return {"status": "russia_resale", "equipment_with_customs_rub": str(money(item["price_rub"])),
                "additional_import_payments_rub": "0.00", "vat_in_seller_price": True}
    if item["pricing_mode"] != "import_estimate":
        raise ValueError("Unknown pricing mode")
    price = money(D(str(item["price_original"])) * D(str(rates[item["currency"]])))
    c = estimate(price, **item["import_inputs"])
    return {"status": "preliminary_scenario", "calculated_on": DATE,
            "border_transport_included": False, **c}


def dl(rows, cls):
    return '<dl class="' + cls + '">' + ''.join(
        '<div><dt>'+html.escape(k)+'</dt><dd>'+html.escape(v)+'</dd></div>' for k,v in rows) + '</dl>'


def rebuild():
    """Render a single customer-facing price; costing stays in internal records."""
    from urllib.parse import quote
    data = json.loads((ROOT / "equipment/listings.json").read_text())
    cards = []
    for item in data["items"]:
        total = D(item["offer_price_rub"])
        serial = html.escape(item["serial"])
        request = "mailto:oootegroup@gmail.com?subject=" + quote("Спецтехника: " + item["model"] + " / " + item["serial"])
        card = '<article class="equipment-card" data-kind="'+item["kind"]+'" id="'+item["id"]+'"><div class="machine-photo"><img src="/assets/equipment/'+item["id"]+'.webp" alt="'+html.escape(item["model"])+' — фото из объявления продавца" width="800" height="600" loading="lazy"><span>'+html.escape(item["location"])+'</span></div><div class="machine-copy"><p class="eyebrow">'+item["kind"]+' / '+str(item["year"])+'</p><h2>'+html.escape(item["model"])+'</h2><p class="machine-specs">'+html.escape(item["specs"])+'</p><div class="machine-price"><small>Стоимость техники</small><strong>'+millions(str(total))+' млн ₽</strong><span>Предварительная стоимость</span></div><p class="machine-delivery">Доставка рассчитывается индивидуально.</p>'
        card += '<div class="machine-id"><small>'+item["serial_type"]+'</small><code>'+serial+'</code><button type="button" class="copy-id" data-serial="'+serial+'" aria-label="Скопировать номер '+serial+'">Копировать</button></div>'
        card += '<details><summary>Источник и проверка истории</summary><p>'+html.escape(item["seller"])+' · проверка публикации 19.10.2026. Наличие и состояние подтверждаются перед покупкой.</p><p>Номер опубликован продавцом. Сверьте его с табличкой и ПСМ/ЭПТС, проверьте ограничения, залоги и сервисные записи. Наличие номера не означает, что история уже проверена или доступна в единой базе.</p><p>'+html.escape(item["condition_note"])+'</p><a href="'+html.escape(item["source_url"],quote=True)+'" target="_blank" rel="noopener noreferrer">Открыть объявление продавца ↗</a><p><a href="https://www.google.com/search?q=%22'+serial+'%22" target="_blank" rel="noopener noreferrer">Поиск упоминаний номера ↗</a></p></details><a class="machine-request" href="'+request+'">Уточнить предложение <span>↗</span></a></div></article>'
        cards.append(card)
    page = ROOT / "equipment/index.html"
    text = page.read_text()
    text = re.sub(r'<div class="equipment-grid">.*?</div></section>', '<div class="equipment-grid">' + "\n".join(cards) + '</div></section>', text, count=1, flags=re.S)
    text = re.sub(r'<aside class="budget-note">.*?</aside>', '<aside class="budget-note"><strong>Техника под вашу задачу.</strong><p>В карточках указана предварительная стоимость техники. Доставка рассчитывается индивидуально и оплачивается отдельно. Согласованную стоимость и условия поставки фиксируем в спецификации к договору.</p></aside>', text, count=1, flags=re.S)
    text = text.replace('Предложения из Китая под ввоз и техника уже в России.', 'Пять предложений с фотографиями, характеристиками и номерами для проверки истории.')
    text = text.replace('ориентир за единицу без доставки', 'стоимость техники за единицу')
    text = re.sub(r'(<meta name="description" content=")[^"]*', r'\g<1>Погрузчик, экскаваторы и самосвалы для строительных компаний. Стоимость техники, фотографии, VIN и заводские номера. Индивидуальные условия поставки.', text, count=1)
    text = text.replace('Подберём технику и рассчитаем таможенное оформление.', 'Подберём технику и согласуем условия поставки.')
    text = re.sub(r'equipment.css\?v=[^" ]+', 'equipment.css?v=20261019-5', text)
    page.write_text(text)


if __name__ == "__main__":
    rebuild()

import hashlib, html
from .domain import LEGAL_VERSION, CONTRACT_CONSENT_VERSION
from .legal_content import PRIVACY_VERSION, CONTRACT_VERSION, ACCOUNT_REQUEST, CONTRACT_REQUEST, SPECIFICATION, policy_html, contract_terms, fields_html

def esc(v):return html.escape(str(v if v is not None else ''))
def money(v):return f'{v:,}'.replace(',',' ')+' ₽' if v is not None else 'не установлена'
def shell(title,body,printable=False):
    button='<button id="printDocument">Печать / сохранить PDF</button>' if printable else ''
    return f'''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} | TE GROUP</title><link rel="stylesheet" href="/assets/css/auto.css"><body class="document"><main><a href="/cars/">← Автомобили TE GROUP</a><h1>{esc(title)}</h1>{body}{button}<script src="/assets/js/document.js" defer></script></main></body></html>'''
def legal_body(kind,config):
    o=config.get('operator',{});operator=f"{esc(o.get('name') or 'ОсОО «ТЕ ГРУПП»')}, ИНН {esc(o.get('tax_id') or '00506202410612')}, адрес: {esc(o.get('address') or 'Кыргызстан, Бишкек, ул. Киевская, 77, офис 603')}"
    notice='' if config.get('documents_approved') else '<p class="notice">Проект для локальной проверки. До запуска требуются заполнение индивидуальных условий, проверка реквизитов и утверждение документов. Используйте тестовые данные.</p>'
    version=CONTRACT_CONSENT_VERSION if kind=='contract-consent' else PRIVACY_VERSION if kind=='privacy' else CONTRACT_VERSION if kind=='contract-template' else LEGAL_VERSION
    common=f'<p>Редакция {esc(version)}. Оператор / продавец: {operator}.</p>'
    if kind=='privacy':return notice+policy_html()
    if kind=='contract-template':return notice+common+contract_terms()+fields_html('Спецификация автомобиля и расчет',SPECIFICATION)
    if kind in ('consent','contract-consent'):
        title='Заявление о создании кабинета' if kind=='consent' else 'Запрос подготовки договора'
        paragraphs=ACCOUNT_REQUEST if kind=='consent' else CONTRACT_REQUEST
        return notice+common+'<h2>'+title+'</h2>'+''.join('<p>'+esc(p)+'</p>' for p in paragraphs)
    return notice+common+'<h2>Условия бронирования</h2><p>Бронь фиксирует выбранный автомобиль и версию утвержденной сметы внутри TE GROUP до указанного времени. Внешняя доступность подтверждается сотрудником по фактическому документу; внутренняя бронь сама по себе не обязывает иностранного поставщика.</p><p>Бронирование не является подписанием договора. Цена компании и самостоятельные расходы покупателя показываются отдельно. При устаревании данных, изменении источника или истечении сметы новая бронь требует повторного подтверждения.</p><p>Проект договора и черновик инвойса доступны в кабинете. Платежный счет допускается только после согласования и подписания договора, заполнения индивидуальных сроков, условий аванса и утверждения реквизитов. Черновик не оплачивается. Статус оплаты подтверждается сотрудником по банковскому документу.</p><p>Срок поставки — от двух месяцев; конкретный срок передачи и начало отсчета фиксируются в договоре. Аванс является частью цены и не объявляется безусловно невозвратным. Возврат, состояние, перевозка и ответственность определяются договором с сохранением обязательных прав покупателя.</p>'
def legal_hash(config):return hashlib.sha256(legal_body('consent',config).encode()).hexdigest()
def legal_page(kind,config):
    return shell({'privacy':'Конфиденциальность и обработка данных','consent':'Заявление о создании кабинета','contract-consent':'Запрос подготовки договора','reservation':'Условия бронирования','contract-template':'Проект договора купли продажи'}[kind],legal_body(kind,config))
def invoice(b,issuer):
    s=b['snapshot'];status=b['invoice_status'];issued=status in ('issued','paid'); q=s['quote']; draft=not issued
    title=f"{'Черновик счета' if draft else 'Счет'} № TE-{b['invoice_id']:06d}"
    body=f'<p class="notice">{esc("Документ аннулирован — оплате не подлежит." if status=="void" else "Черновик — реквизиты или условия платежа не утверждены. Оплате не подлежит." if draft else "Счет на аванс по бронированию. Другие расходы не включены в этот платеж.")}</p>'
    buyer=b.get('preparation',{}).get('buyer') or {}
    body+=f'<p>Покупатель: {esc(buyer.get("full_name") or s["customer"]["name"])} · {esc(s["customer"]["email"])}</p><p>Автомобиль: {esc(s["offer"]["title"])} · {esc(s["offer"]["source_id"])}. VIN: {esc(q.get("vin"))}. Бронь: {esc(b["id"])}.</p><h2>Аванс: {money(b["invoice_amount"])}</h2><p>Полный бюджет: {money(q["total_rub"])}. Сумма компании: {money(q["company_rub"])}. Импорт и другие расходы покупателя: {money(q["buyer_costs_rub"])}. Ремонт: {money(q.get("repair_rub",0))}.</p>'
    if issued:
        body+='<h2>Получатель</h2><dl>'+''.join(f'<dt>{label}</dt><dd>{esc(issuer.get(key))}</dd>' for key,label in [('name','Наименование'),('tax_id','ИНН / налоговый номер'),('address','Адрес'),('bank','Банк'),('account','Счет'),('bank_code','БИК / банковский код'),('payment_terms','Условия платежа')])+'</dl>'
    body+=f'<p>Назначение: аванс по бронированию {esc(b["id"])} для {esc(s["offer"]["title"])}. Проект договора и смета доступны в кабинете.</p>'
    return shell(title,body,True)
def contract(b,issuer):
    s=b['snapshot'];q=s['quote']
    buyer=b.get('preparation',{}).get('buyer') or {}
    body='<p class="notice">Проект условий сделки. Документ требует утверждения и подписания сторонами. Подтверждение в интерфейсе не заменяет подпись.</p>'
    body+=f'<p>Бронь: {esc(b["id"])}. Продавец: {esc(issuer.get("name") or "не утвержден")}. Покупатель: {esc(buyer.get("full_name") or s["customer"]["name"])}.</p><h2>{esc(s["offer"]["title"])}</h2><p>VIN: {esc(q.get("vin"))}. Идентификатор продавца: {esc(s["offer"]["source_id"])}. Источник: {esc(s["offer"]["source_url"])}. Страна: {esc(s["offer"]["country"])}.</p><h2>Зафиксированная смета</h2><dl>'+''.join(f'<dt>{label}</dt><dd>{money(q.get(key,0))}</dd>' for key,label in [('vehicle_rub','Автомобиль'),('delivery_rub','Доставка'),('company_fee_rub','Услуги компании'),('company_rub','Сумма компании'),('buyer_costs_rub','Импорт и другие расходы покупателя'),('repair_rub','Ремонт (оплачивает покупатель)'),('total_rub','Полный бюджет')])+f'</dl><p>Пункт доставки: {esc(q["destination"])}.</p><p>{esc(s.get("delivery",{}).get("note") or "Срок поставки и начало его отсчета требуется согласовать в договоре.")}</p><p>Согласованные условия: {esc(q["terms"])}</p><p>До подписания требуется согласовать идентификацию конкретного автомобиля (VIN/лот), сроки, порядок оплаты и зачета аванса, возврат, отказ продавца, риски доставки и разрешение споров. Эти условия не выдумываются приложением.</p>'
    p=b.get('preparation',{});buyer=p.get('buyer')
    body+='<h2>Данные для оформления</h2>'
    if buyer:
        body+=f'<p>Покупатель: {esc(buyer["full_name"])}. Телефон: {esc(buyer["phone"])}. Email: {esc(buyer["email"])}.</p><p>Подтвержденный пункт доставки: {esc(buyer["destination"])}. Редакция данных: {p["revision"]}.</p>'
    else:body+='<p>Покупатель еще не передал данные для подготовки договора.</p>'
    body+='<h2>Проверка комплекта документов</h2>'+''.join(f'<p>{esc(d["label"])}: {esc({"missing":"не получен","received":"получен, требуется проверка","verified":"проверен сотрудником","rejected":"отклонен"}[d["status"]])}. Подтверждение: {esc(d["reference"] or "не предоставлено")}. {esc(d["note"])}</p>' for d in p.get('documents',[]))
    body+='<p>Отчет, экспортный документ и подтверждение продавца учитываются по ссылке или номеру фактического документа. Статус в кабинете не заменяет сам документ. Идентификация покупателя и подписание согласуются отдельно.</p>'
    body+=contract_terms()+fields_html('Индивидуальные условия для заполнения до подписания',SPECIFICATION)
    return shell('Проект договора купли продажи и спецификация',body,True)

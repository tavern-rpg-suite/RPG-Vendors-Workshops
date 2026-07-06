import { getContext, extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_roles, characters } from '../../../../script.js';

const MODULE_NAME = 'rpg_vendors';
const PROMPT_KEY = 'rpg_vendor_injection';
const PROMPT_KEY_Q = 'rpg_vendor_quest_injection';
const PROMPT_KEY_CARD = 'rpg_vendor_card_injection';
const VENDOR_TYPES = ['blacksmith', 'tailor', 'apothecary', 'cook', 'merchant', 'jeweler', 'other'];
const TYPE_ICONS = { blacksmith: 'fa-hammer', tailor: 'fa-scissors', apothecary: 'fa-mortar-pestle', cook: 'fa-utensils', merchant: 'fa-store', jeweler: 'fa-gem', other: 'fa-user' };

const defaultSettings = {
    enabled: false,
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'google/gemma-4-31b-it',
    temperature: 0.8,
    language: 'en',
    injectDepth: 2,
    cardInject: true,
    questGlobal: true,
    questsNeedPresence: false,
    autoChatNote: true,
    chatStates: {}
};

let settings = {};
let state = null;
let view = 'list';        // 'list'(index) | 'form' | 'workshop'(dossier)
let formVendor = null;    // vendor being edited, or null for new
let currentVendorId = null;
let selSlot = '';
let selItemId = '';
let vi = 0;               // rolodex index
let dir = 0;              // flip direction for animation
let tab = 'profile';      // dossier tab

function genId() { return Math.random().toString(36).substr(2, 9); }
function escapeHtml(x) {
    return String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function genLang() { return settings.language === 'ru' ? 'Russian' : 'English'; }

const I18N = {
    en: {
        btn_title: 'Vendors & Workshops', panel_title: 'Vendors & Workshops', subtitle: 'CONTACT CARD FILE', cardfile_tab: 'CARD FILE', cardfile_tab_b: 'VENDORS', tab_profile: 'Profile', tab_shop: 'Shop', tab_jobs: 'Jobs', tab_repair: 'Repair', open_dossier: 'Open dossier', trade_lbl: 'TRADE:', close_lbl: 'Close',
        type_blacksmith: 'Blacksmith', type_tailor: 'Tailor', type_apothecary: 'Apothecary',
        type_cook: 'Cook', type_merchant: 'Merchant', type_jeweler: 'Jeweler', type_other: 'Vendor',
        create: 'Create vendor', auto: 'Auto from lore', auto_ai: 'Auto (AI picks type)', open: 'Open', edit: 'Edit', del: 'Delete',
        back: 'Back', save: 'Save', cancel: 'Cancel', leave: 'Leave workshop',
        name_ph: 'Vendor name', desc_ph: 'What they do / who they are', type_label: 'Type:',
        no_vendors: 'No vendors yet. Link a character card, or auto-generate one.',
        link_card: 'Character card:', pick_card: '— none (manual) —', no_cards: 'No character cards loaded.', mes_btn_title: 'Open this vendor',
        gen_desc: 'Generate', desc_gen: 'Writing a description...', desc_gen_done: 'Description generated.', desc_gen_err: 'Could not generate — check URL / key / model.',
        custom_type: 'Custom trade (used when type is "Vendor/Other")', custom_domain: 'What they sell / repair (optional)',
        q_section: 'Quests', q_get: 'Ask for work', q_none: 'No work posted yet — ask the vendor.',
        q_req: 'Bring / do:', q_reward: 'Reward:', q_accept: 'Accept', q_complete: 'Complete (success)',
        q_fail: 'Fail', q_abandon: 'Abandon', q_announce: 'Announce in chat',
        reward_item: 'item — {name}', reward_repair: '{amount}% repair', reward_coins: '{amount} coins', reward_buff: 'effect — {name}',
        shop_section: 'Shop', restock: 'Restock', buy: 'Buy', sell: 'Sell', sell_label: 'Sell from backpack:',
        no_goods: 'No goods on display — restock.', not_enough: 'Not enough coins.', no_inv_shop: 'Inventory module is off — the shop needs it.',
        bought: 'Bought {name}.', sold: 'Sold {name} (+{n} coins).',
        give_coins: 'Give', give_label: 'Give coins to {vendor}:', gave: 'Gave {n} coins to {vendor}.', cn_give: '*[{user} gives {n} coins to {vendor}.]*',
        shop_gen: 'The vendor lays out their wares...', shop_gen_done: 'Wares restocked!', shop_gen_err: 'Could not restock — check URL / key / model.',
        q_done_coins: 'Reward: +{n} coins.', q_done_buff: 'Reward effect gained: {name}.',
        q_gen: 'The vendor thinks up some work...', q_gen_done: 'New work posted!',
        q_gen_err: 'Could not get quests — check URL / key / model.',
        q_accepted: 'Quest accepted.', q_abandoned: 'Quest abandoned.', q_failed: 'Quest failed.',
        q_done_item: 'Reward added to your backpack: {name}.',
        q_done_repair: 'Reward: repaired your {gear} (+{amount}%).',
        q_done_repair_none: 'Reward ready, but nothing to repair right now.',
        q_done_plain: 'Quest complete. Reward: {reward}.',
        q_need_inv: 'Inventory module is off — the reward could not be stored.',
        q_announced: 'Quest note added to the chat.',
        set_autonote: 'Write quest/shop notes into the chat',
        set_cardinject: 'Inject vendor knowledge (goods & active quests)',
        set_questglobal: 'Quests visible to the whole scene (off = only the vendor card knows)',
        set_needpresence: 'Take quests only when you are at the vendor (story-gated)',
        not_present: 'You are not at {vendor} right now — let the story bring you to them first.', im_here: "I'm at this vendor now (story)",
        cn_accept: '*[{user} accepted a job from {vendor} (a {role}): "{title}". Task: {req}. Reward: {reward}.]*',
        cn_done: '*[{user} completed "{title}" for {vendor} (a {role}). Reward: {reward}.]*',
        cn_repair: '*[{user} had {vendor} repair their {gear} using {item}.]*',
        inject_quest: 'Active quest — "{vendor}" is an NPC ({role}) who gave {{user}} a job: "{title}". To do: {req}. Reward on completion: {reward}. "{vendor}" is aware of this arrangement; other present characters only know about it if {{user}} tells them',
        repair_title: 'Repair gear', gear_label: 'Damaged gear:', item_label: 'Offer an item:', in_backpack: 'In backpack',
        offer: 'Offer item to repair',
        no_eq: 'Equipment module is off — enable it to repair gear here.',
        no_inv: 'Inventory module is off — enable it to offer items.',
        nothing_to_repair: 'Nothing on you needs repair right now.',
        no_items: 'Your backpack is empty.',
        pick_both: 'Pick a piece of gear and an item.',
        active_here: 'You are here', set_active: 'Enter workshop',
        toast_validating: 'The vendor inspects the item...',
        toast_repaired: '{vendor}: fixed your {gear} (+{amt}%). {reason}', mat_used_up: '{item} is used up.', mat_left: '{item}: {n}% left.',
        toast_rejected: '{vendor}: {reason}',
        toast_repair_err: 'The vendor could not be reached — check URL / key / model.',
        toast_vendor_saved: 'Vendor saved.', toast_vendor_deleted: 'Vendor removed.',
        toast_gen: 'Conjuring a fitting vendor from the lore...', toast_gen_done: 'Vendor created!',
        toast_gen_err: 'Could not generate a vendor — check URL / key / model.',
        toast_need_name: 'Enter a vendor name.',
        inject_at: '{{user}} is at "{name}", a {type}. This vendor knows their own trade and can see the gear {{user}} brought to repair',
        inject_card_head: 'You are {vendor}, a {role}. You know your own business:', inject_goods: 'your shop currently stocks: {goods}.', inject_myquests: 'jobs you have given {{user}}: {list}.',
        set_title: 'RPG Vendors & Workshops', set_enable: 'Enable Vendors',
        set_api: 'API Settings', set_depth: 'Context injection depth:',
        set_lang: 'Language:', set_url: 'URL', set_key: 'API Key', set_model: 'Model'
    },
    ru: {
        btn_title: 'Вендоры и мастерские', panel_title: 'Вендоры и мастерские', subtitle: 'КАРТОТЕКА КОНТАКТОВ', cardfile_tab: 'КАРТОТЕКА', cardfile_tab_b: 'ВЕНДОРЫ', tab_profile: 'Профиль', tab_shop: 'Лавка', tab_jobs: 'Задания', tab_repair: 'Починка', open_dossier: 'Открыть досье', trade_lbl: 'РЕМЕСЛО:', close_lbl: 'Закрыть',
        type_blacksmith: 'Оружейник', type_tailor: 'Портной', type_apothecary: 'Аптекарь',
        type_cook: 'Кулинар', type_merchant: 'Торговец', type_jeweler: 'Ювелир', type_other: 'Вендор',
        create: 'Создать вендора', auto: 'Авто из лора', auto_ai: 'Авто (ИИ выберет тип)', open: 'Открыть', edit: 'Изменить', del: 'Удалить',
        back: 'Назад', save: 'Сохранить', cancel: 'Отмена', leave: 'Покинуть мастерскую',
        name_ph: 'Имя вендора', desc_ph: 'Чем занимается / кто это', type_label: 'Тип:',
        no_vendors: 'Вендоров пока нет. Привяжи карту персонажа или сгенерируй.',
        link_card: 'Карта персонажа:', pick_card: '— нет (вручную) —', no_cards: 'Карты персонажей не загружены.', mes_btn_title: 'Открыть этого вендора',
        gen_desc: 'Сгенерировать', desc_gen: 'Пишу описание...', desc_gen_done: 'Описание готово.', desc_gen_err: 'Не удалось сгенерировать — проверь URL / ключ / модель.',
        custom_type: 'Своё ремесло (если тип «Вендор/Другое»)', custom_domain: 'Чем торгует / что чинит (необязательно)',
        q_section: 'Задания', q_get: 'Спросить о работе', q_none: 'Работы пока нет — спроси вендора.',
        q_req: 'Принести / сделать:', q_reward: 'Награда:', q_accept: 'Принять', q_complete: 'Завершить (успех)',
        q_fail: 'Провал', q_abandon: 'Отказаться', q_announce: 'Объявить в чате',
        reward_item: 'предмет — {name}', reward_repair: '{amount}% починки', reward_coins: '{amount} монет', reward_buff: 'эффект — {name}',
        shop_section: 'Магазин', restock: 'Обновить товар', buy: 'Купить', sell: 'Продать', sell_label: 'Продать из рюкзака:',
        no_goods: 'Товара нет — обнови.', not_enough: 'Не хватает монет.', no_inv_shop: 'Модуль инвентаря выключен — магазину он нужен.',
        bought: 'Куплено: {name}.', sold: 'Продано: {name} (+{n} монет).',
        give_coins: 'Дать', give_label: 'Дать монеты ({vendor}):', gave: 'Отдано {n} монет: {vendor}.', cn_give: '*[{user} даёт {n} монет: {vendor}.]*',
        shop_gen: 'Вендор раскладывает товар...', shop_gen_done: 'Товар обновлён!', shop_gen_err: 'Не удалось обновить — проверь URL / ключ / модель.',
        q_done_coins: 'Награда: +{n} монет.', q_done_buff: 'Получен эффект: {name}.',
        q_gen: 'Вендор придумывает работу...', q_gen_done: 'Новая работа есть!',
        q_gen_err: 'Не удалось получить задания — проверь URL / ключ / модель.',
        q_accepted: 'Задание принято.', q_abandoned: 'Задание отброшено.', q_failed: 'Задание провалено.',
        q_done_item: 'Награда добавлена в рюкзак: {name}.',
        q_done_repair: 'Награда: починил твоё ({gear}) (+{amount}%).',
        q_done_repair_none: 'Награда готова, но чинить сейчас нечего.',
        q_done_plain: 'Задание выполнено. Награда: {reward}.',
        q_need_inv: 'Модуль инвентаря выключен — награду некуда положить.',
        q_announced: 'Заметка о квесте добавлена в чат.',
        set_autonote: 'Писать заметки о квестах/лавке в чат',
        set_cardinject: 'Вставлять знания вендора (товар и активные квесты)',
        set_questglobal: 'Квесты видны всей сцене (выкл = знает только карта вендора)',
        set_needpresence: 'Брать квесты только когда ты у вендора (по сюжету)',
        not_present: 'Ты сейчас не у «{vendor}» — пусть сначала сюжет приведёт тебя к нему.', im_here: 'Я сейчас у этого вендора (по сюжету)',
        cn_accept: '*[{user} берёт у {vendor} ({role}) задание: «{title}». Нужно: {req}. Награда: {reward}.]*',
        cn_done: '*[{user} выполнил «{title}» для {vendor} ({role}). Награда: {reward}.]*',
        cn_repair: '*[{user} отдаёт {vendor} починить ({gear}) с помощью «{item}».]*',
        inject_quest: 'Активный квест — «{vendor}» это NPC ({role}), который дал {{user}} задание: «{title}». Нужно: {req}. Награда за выполнение: {reward}. «{vendor}» в курсе этой договорённости; остальные присутствующие знают о ней, только если {{user}} расскажет',
        repair_title: 'Починка снаряжения', gear_label: 'Повреждённое:', item_label: 'Предложить предмет:', in_backpack: 'В рюкзаке',
        offer: 'Отдать предмет на починку',
        no_eq: 'Модуль экипировки выключен — включи его, чтобы чинить здесь.',
        no_inv: 'Модуль инвентаря выключен — включи его, чтобы отдавать предметы.',
        nothing_to_repair: 'Чинить сейчас нечего.',
        no_items: 'Рюкзак пуст.',
        pick_both: 'Выбери предмет снаряжения и предмет из рюкзака.',
        active_here: 'Ты здесь', set_active: 'Войти в мастерскую',
        toast_validating: 'Вендор осматривает предмет...',
        toast_repaired: '{vendor}: починил твоё ({gear}) (+{amt}%). {reason}', mat_used_up: '«{item}» израсходован.', mat_left: '«{item}»: осталось {n}%.',
        toast_rejected: '{vendor}: {reason}',
        toast_repair_err: 'Не удалось связаться с вендором — проверь URL / ключ / модель.',
        toast_vendor_saved: 'Вендор сохранён.', toast_vendor_deleted: 'Вендор удалён.',
        toast_gen: 'Призываю подходящего вендора из лора...', toast_gen_done: 'Вендор создан!',
        toast_gen_err: 'Не удалось сгенерировать вендора — проверь URL / ключ / модель.',
        toast_need_name: 'Введите имя вендора.',
        inject_at: '{{user}} находится у «{name}» ({type}). Этот вендор знает своё ремесло и видит снаряжение, которое {{user}} принёс на починку',
        inject_card_head: 'Ты — {vendor}, {role}. Ты знаешь своё дело:', inject_goods: 'сейчас у тебя в продаже: {goods}.', inject_myquests: 'задания, которые ты дал {{user}}: {list}.',
        set_title: 'RPG Vendors & Workshops', set_enable: 'Включить вендоров',
        set_api: 'Настройки API', set_depth: 'Глубина вставки в контекст:',
        set_lang: 'Язык:', set_url: 'URL', set_key: 'API-ключ', set_model: 'Модель'
    }
};
function t(key, vars) {
    const lang = settings.language === 'ru' ? 'ru' : 'en';
    let str = (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
    if (vars) for (const k in vars) str = str.split('{' + k + '}').join(vars[k]);
    return str;
}

function loadSettings() {
    if (!extension_settings[MODULE_NAME]) extension_settings[MODULE_NAME] = {};
    settings = Object.assign({}, defaultSettings, extension_settings[MODULE_NAME]);
    if (!settings.chatStates) settings.chatStates = {};
}
function saveSettings() {
    extension_settings[MODULE_NAME] = settings;
    if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();
}

function freshState() { return { vendors: [], activeVendorId: null, quests: [] }; }
function loadState() {
    const chatId = getContext().chatId;
    if (!chatId) { state = freshState(); return; }
    if (settings.chatStates[chatId]) {
        state = settings.chatStates[chatId];
        if (!Array.isArray(state.vendors)) state.vendors = [];
        if (!('activeVendorId' in state)) state.activeVendorId = null;
        if (!Array.isArray(state.quests)) state.quests = [];
    } else {
        state = freshState();
        settings.chatStates[chatId] = state;
    }
}
function saveState() {
    const chatId = getContext().chatId;
    if (chatId) settings.chatStates[chatId] = state;
    saveSettings();
}

async function callAI(systemPrompt, userPrompt) {
    if (!settings.apiKey) throw new Error('API key is not set');
    const url = (settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '') + '/chat/completions';
    for (let i = 0; i < 2; i++) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${settings.apiKey.trim()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                    temperature: settings.temperature,
                    response_format: { type: 'json_object' }
                })
            });
            if (res.status === 429 && i === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const content = data.choices[0].message.content.trim();
            const m = content.match(/\{[\s\S]*\}/);
            return JSON.parse(m ? m[0] : content);
        } catch (e) { if (i === 1) throw e; }
    }
}

// ---- cross-extension bridge accessors (read live; degrade gracefully) ----
function eqApi() { return (window.RPG && window.RPG.equipment && window.RPG.equipment.available) ? window.RPG.equipment : null; }
function invApi() { return (window.RPG && window.RPG.inventory && window.RPG.inventory.available) ? window.RPG.inventory : null; }
function vitApi() { return (window.RPG && window.RPG.vitals && window.RPG.vitals.available) ? window.RPG.vitals : null; }

function typeLabel(ty) { return t('type_' + (VENDOR_TYPES.includes(ty) ? ty : 'other')); }
const TYPE_DOMAIN = {
    blacksmith: 'weapons, armour, metal tools, forging and metal repairs, ore and metal materials',
    tailor: 'clothing, garments, fabric, leather goods and sewing',
    apothecary: 'medicines, potions, tonics, herbs, poisons and healing remedies',
    cook: 'food, meals, ingredients, spices, drinks and things from the kitchen',
    merchant: 'general goods, supplies, trinkets and everyday wares',
    jeweler: 'jewellery, gems, precious metals and fine accessories',
    other: 'their own trade'
};
function domainOf(ty) { return TYPE_DOMAIN[ty] || 'their trade'; }
function vendorRole(v) { return (v && v.type === 'other' && v.customType) ? v.customType : typeLabel(v && v.type); }
function vendorPresent(v) {
    if (!settings.questsNeedPresence) return true;
    if (!v) return false;
    if (state.presentVendorId === v.id) return true;
    if (v.charName && resolveSpeaker() === v.charName) return true;
    return false;
}
function vendorDomain(v) {
    if (v && v.customDomain) return v.customDomain;
    if (v && v.type === 'other') return v.customType ? ('the trade of a ' + v.customType) : 'their own trade';
    return domainOf(v && v.type);
}
function cardLoreByName(name) {
    try { const card = (characters || []).find(c => c && c.name === name); return (card && card.description) ? String(card.description).substring(0, 700) : ''; } catch (e) { return ''; }
}
function vendorPersona(vendor) {
    let desc = vendor.desc || '';
    if (vendor.charName) { const l = cardLoreByName(vendor.charName); if (l) desc = l; }
    return String(desc).substring(0, 700);
}
async function generateVendorDesc(body) {
    const type = body.find('.rpg-vnd-f-type').val();
    const customType = body.find('.rpg-vnd-f-customtype').val().trim();
    const customDomain = body.find('.rpg-vnd-f-customdomain').val().trim();
    const charName = body.find('.rpg-vnd-f-card').val();
    const name = body.find('.rpg-vnd-f-name').val().trim() || charName || '';
    const lore = cardLoreByName(charName);
    const role = (type === 'other' && customType) ? customType : typeLabel(type);
    const domain = customDomain || (type === 'other' ? (customType ? ('the trade of a ' + customType) : 'their own trade') : domainOf(type));
    toastr.info(t('desc_gen'));
    try {
        const sys = `Write a short vendor description for an RPG.
Vendor: "${name || 'a vendor'}", whose ROLE is a ${role}.
As a ${role} they deal in: ${domain}. This trade is fixed by their role.
${lore ? 'Base their personality/voice on this character:\n' + lore : ''}
Write 1-2 vivid sentences about who they are and what they offer, fitting BOTH the ${typeLabel(type)} role (their goods/services must match it) AND their personality. Write strictly in ${genLang()}.
Output strictly JSON: {"desc":""}`;
        const res = await callAI(sys, settingContext());
        if (res && res.desc) { body.find('.rpg-vnd-f-desc').val(String(res.desc)); toastr.success(t('desc_gen_done')); }
        else toastr.error(t('desc_gen_err'));
    } catch (e) { toastr.error(t('desc_gen_err')); }
}
function settingContext() {
    const ctx = getContext();
    let lore = '';
    try { if (ctx.characterId !== undefined && characters[ctx.characterId]) lore = characters[ctx.characterId].description || ''; } catch (e) { lore = ''; }
    const first = (ctx.chat && ctx.chat[0]) ? (ctx.chat[0].mes || '') : '';
    const last = (ctx.chat && ctx.chat.length) ? (ctx.chat[ctx.chat.length - 1].mes || '') : '';
    return `World, era and setting (from the character card):\n${String(lore).substring(0, 800)}\n\nStory opening:\n${String(first).substring(0, 400)}\n\nMost recent scene:\n${String(last).substring(0, 300)}`;
}

// ---- vendor CRUD ----
function saveVendor(v) {
    if (!v.name || !v.name.trim()) { toastr.warning(t('toast_need_name')); return false; }
    if (!VENDOR_TYPES.includes(v.type)) v.type = 'other';
    if (v.id) {
        const idx = state.vendors.findIndex(x => x.id === v.id);
        if (idx >= 0) state.vendors[idx] = v; else state.vendors.push(v);
    } else {
        v.id = genId(); state.vendors.push(v);
    }
    saveState(); toastr.success(t('toast_vendor_saved'));
    return true;
}
function deleteVendor(id) {
    state.vendors = state.vendors.filter(v => v.id !== id);
    if (state.activeVendorId === id) state.activeVendorId = null;
    saveState(); buildInjection(); toastr.info(t('toast_vendor_deleted'));
}
async function autoGenerateVendor(forcedType) {
    const forced = (forcedType && forcedType !== 'auto' && VENDOR_TYPES.includes(forcedType) && forcedType !== 'other') ? forcedType : '';
    toastr.info(t('toast_gen'));
    try {
        const sys = forced
            ? `Design a fitting NPC ${typeLabel(forced)} for an RPG, based on the setting/lore below.
As a ${typeLabel(forced)} they deal in: ${domainOf(forced)} (this is fixed by their role).
Invent a fitting name (a person or a shop) and a one-sentence description of who they are and what they trade or repair — matching BOTH the ${typeLabel(forced)} role and the setting.
Write the name and description strictly in ${genLang()}.
Output strictly JSON: {"name":"","desc":""}`
            : `You are designing a fitting NPC craftsman / vendor for an RPG, based on the setting/lore.
Choose the most fitting type from exactly this list: blacksmith, tailor, apothecary, cook, merchant, jeweler.
Invent a fitting name (it can be a person or a shop) and a one-sentence description of who they are and what they trade or repair.
Write the name and description strictly in ${genLang()}.
Output strictly JSON: {"type":"blacksmith","name":"","desc":""}`;
        const res = await callAI(sys, settingContext());
        const type = forced || (VENDOR_TYPES.includes(res.type) ? res.type : 'other');
        const v = { id: genId(), type: type, name: String(res.name || 'Vendor'), desc: String(res.desc || ''), charName: '' };
        state.vendors.push(v); saveState();
        toastr.success(t('toast_gen_done'));
        view = 'list'; renderPanel();
    } catch (e) { toastr.error(t('toast_gen_err')); }
}

// ---- active vendor + injection ----
function setActive(id) { state.activeVendorId = id; saveState(); buildInjection(); }
function rewardText(r) {
    if (!r) return '';
    if (r.kind === 'item') return t('reward_item', { name: r.name });
    if (r.kind === 'repair') return t('reward_repair', { amount: r.amount });
    if (r.kind === 'coins') return t('reward_coins', { amount: r.amount });
    if (r.kind === 'buff') return t('reward_buff', { name: r.name });
    return r.name || '';
}
function buildInjection() {
    if (!settings.enabled || !state || settings.injectDepth < 0) {
        setExtensionPrompt(PROMPT_KEY, '', 2, 0, false, extension_prompt_roles.SYSTEM);
        setExtensionPrompt(PROMPT_KEY_Q, '', 2, 0, false, extension_prompt_roles.SYSTEM);
        setExtensionPrompt(PROMPT_KEY_CARD, '', 2, 0, false, extension_prompt_roles.SYSTEM);
        return;
    }
    // ambient note (you are standing at a workshop) — at the normal depth
    const v = state.vendors.find(x => x.id === state.activeVendorId);
    const ambient = v ? `\n[${t('inject_at', { name: v.name, type: vendorRole(v).toLowerCase() })}.]\n` : '';
    setExtensionPrompt(PROMPT_KEY, ambient, 2, settings.injectDepth, false, extension_prompt_roles.SYSTEM);

    // active quests — injected at the very END (depth 0), right before the reply, clearly framed; removed on completion
    const aq = (settings.cardInject && settings.questGlobal) ? (state.quests || []).filter(q => q.status === 'active') : [];
    let qtext = '';
    if (aq.length) {
        qtext = '\n' + aq.map(q => {
            const qv = state.vendors.find(x => x.id === q.vendorId);
            return `[${t('inject_quest', { vendor: qv ? qv.name : '?', role: qv ? vendorRole(qv).toLowerCase() : 'vendor', title: q.title, req: q.requirement, reward: rewardText(q.reward) })}]`;
        }).join('\n') + '\n';
    }
    setExtensionPrompt(PROMPT_KEY_Q, qtext, 2, settings.injectDepth, false, extension_prompt_roles.SYSTEM);
}

// Who is about to reply? (solo: the character; group: the current speaker)
function resolveSpeaker() {
    try {
        const ctx = getContext();
        if (ctx.name2) return ctx.name2;
        if (ctx.characterId !== undefined && characters[ctx.characterId]) return characters[ctx.characterId].name || '';
    } catch (e) {}
    return '';
}
// Card-scoped: a vendor's stock + their own jobs are injected ONLY before THAT vendor's card replies.
function buildCardInjection() {
    if (!settings.enabled || !state || settings.injectDepth < 0 || !settings.cardInject) {
        setExtensionPrompt(PROMPT_KEY_CARD, '', 2, 0, false, extension_prompt_roles.SYSTEM); return;
    }
    const speaker = resolveSpeaker();
    const vendor = speaker ? (state.vendors || []).find(v => v.charName && v.charName === speaker) : null;
    if (!vendor) { setExtensionPrompt(PROMPT_KEY_CARD, '', 2, 0, false, extension_prompt_roles.SYSTEM); return; }
    const goods = (vendor.stock || []).map(g => g.name).filter(Boolean);
    const myQuests = (state.quests || []).filter(q => q.vendorId === vendor.id && q.status === 'active');
    const parts = [];
    if (goods.length) parts.push(t('inject_goods', { goods: goods.join(', ') }));
    if (myQuests.length) parts.push(t('inject_myquests', { list: myQuests.map(q => `"${q.title}" (${q.requirement} -> ${rewardText(q.reward)})`).join('; ') }));
    const text = parts.length ? `\n[${t('inject_card_head', { vendor: vendor.name, role: vendorRole(vendor).toLowerCase() })} ${parts.join(' ')}]\n` : '';
    setExtensionPrompt(PROMPT_KEY_CARD, text, 2, settings.injectDepth, false, extension_prompt_roles.SYSTEM);
}

// ---- the core: repair gear with an inventory item, AI-validated ----
async function offerRepair(vendor) {
    const eq = eqApi(), inv = invApi();
    if (!selSlot || !selItemId) { toastr.warning(t('pick_both')); return; }
    const isInv = selSlot.indexOf('inv:') === 0;
    const targetId = selSlot.slice(selSlot.indexOf(':') + 1);
    if (isInv && targetId === selItemId) { toastr.warning(t('pick_both')); return; }
    let gear = null;
    if (isInv) {
        if (!inv) { toastr.warning(t('pick_both')); return; }
        const g = inv.list().find(i => i.id === targetId);
        if (g) gear = { name: g.name, desc: g.desc, broken: !!g.broken || g.dur <= 0, label: t('in_backpack') };
    } else {
        if (!eq) { toastr.warning(t('pick_both')); return; }
        const g = eq.repairable().find(x => x.slot === targetId);
        if (g) gear = { name: g.name, desc: g.desc, broken: g.broken, label: g.label, slot: g.slot };
    }
    const item = inv ? inv.list().find(i => i.id === selItemId) : null;
    if (!gear || !item) { toastr.warning(t('pick_both')); return; }

    toastr.info(t('toast_validating'));
    try {
        const sys = `You are the logic arbiter for an RPG vendor.
Vendor: "${vendor.name}" — a ${vendorRole(vendor)} (${vendor.desc || 'no extra info'}).
The player wants to repair an item using ONE other item from their backpack.
Item to repair: "${gear.name}" (${gear.desc || 'no description'}) — currently ${gear.broken ? 'BROKEN' : 'damaged'}.
Offered item/material: "${item.name}" (${item.desc || 'no description'}).
Decide REALISTICALLY whether this vendor could plausibly use THIS item to repair or meaningfully restore THIS item.
Be sensible: e.g. an inkwell cannot fix boots (at best it could dye them a little). Only mark logical if the material/tool plausibly helps.
If logical, choose how much durability it restores (different items restore different amounts).
Respond strictly JSON: {"logical": true/false, "amount": <integer 0-100, percent of durability restored if logical else 0>, "reason": "<one short in-character sentence in ${genLang()}>"}`;
        const res = await callAI(sys, 'Judge the repair attempt.');
        if (res.logical) {
            const amt = Math.max(1, Math.min(100, parseInt(res.amount) || 25));
            if (isInv) inv.repair(targetId, amt); else eq.repair(gear.slot, amt);
            // wear the offered material down rather than vanishing it in one use; delete only at 0
            let tail = '';
            if (typeof inv.consumeAsMaterial === 'function') {
                const worn = inv.consumeAsMaterial(item.id, 34);
                tail = ' ' + (worn.consumed ? t('mat_used_up', { item: item.name }) : t('mat_left', { item: item.name, n: worn.left }));
            } else { inv.remove(item.id); }
            selItemId = '';
            if (settings.autoChatNote) insertChatNote(t('cn_repair', { user: getContext().name1 || 'I', vendor: vendor.name, gear: gear.name, item: item.name }));
            toastr.success(t('toast_repaired', { vendor: vendor.name, gear: gear.name, amt: amt, reason: res.reason || '' }) + tail);
        } else {
            toastr.warning(t('toast_rejected', { vendor: vendor.name, reason: res.reason || '' }));
        }
        renderPanel();
    } catch (e) { toastr.error(t('toast_repair_err')); }
}

function mostDamagedSlot() {
    const eq = eqApi(); if (!eq) return null;
    const r = eq.repairable(); if (!r.length) return null;
    r.sort((a, b) => (a.dur / (a.max || 100)) - (b.dur / (b.max || 100)));
    return r[0].slot;
}
async function generateQuests(vendor) {
    if (!settings.enabled) return;
    toastr.info(t('q_gen'));
    const ctx = getContext();
    const first = ctx.chat && ctx.chat[0] ? (ctx.chat[0].mes || '') : '';
    try {
        const sys = `You are ${vendor.name}, a ${vendorRole(vendor)} in an RPG.
Your character and personality: ${vendorPersona(vendor) || ('an ordinary ' + vendorRole(vendor))}.
IMPORTANT — as a ${vendorRole(vendor)} you deal ONLY in: ${vendorDomain(vendor)}. This domain is FIXED by your role; your personality changes only the STYLE, NEVER the domain (a cook's quests are about food/ingredients/the kitchen, not clothing).
Offer the player 3 short side-quests that come from WHO YOU ARE — your trade as a ${vendorRole(vendor)} combined with your personality and the setting below (no anachronisms). Make them SPECIFIC to this vendor: a different ${vendorRole(vendor)} would ask for different things. Avoid generic "go fetch X" tasks that any vendor could give; tie each quest to your character. They should mostly involve fetching/bringing materials, delivering, or helping with your craft.
For each quest give: a short title, a one-sentence description, the concrete requirement (what to bring or do), and a reward.
Reward "kind" is one of: "item" (object added to backpack — set name), "repair" (durability restored — set amount 10-100), "coins" (set amount 1-100), or "buff" (a positive effect — set name, a short "effect" text, and amount = how many turns it lasts).
Write EVERYTHING strictly in ${genLang()}.
Output strictly JSON: {"quests":[{"type":"fetch","title":"","desc":"","requirement":"","reward":{"kind":"item","name":"","effect":"","amount":0}}]}`;
        const res = await callAI(sys, settingContext());
        const arr = Array.isArray(res.quests) ? res.quests : [];
        for (const q of arr.slice(0, 4)) {
            const rk = (q.reward && ['item', 'repair', 'buff', 'coins'].includes(q.reward.kind)) ? q.reward.kind : 'item';
            state.quests.push({
                id: genId(), vendorId: vendor.id, type: q.type || 'fetch',
                title: String(q.title || 'Task'), desc: String(q.desc || ''), requirement: String(q.requirement || ''),
                reward: { kind: rk, name: String(q.reward && q.reward.name || 'Material'), effect: String(q.reward && q.reward.effect || ''), amount: parseInt(q.reward && q.reward.amount) || 25 },
                status: 'available'
            });
        }
        saveState(); renderPanel(); toastr.success(t('q_gen_done'));
    } catch (e) { toastr.error(t('q_gen_err')); }
}
function findQuest(id) { return (state.quests || []).find(q => q.id === id); }
function acceptQuest(id) {
    const q = findQuest(id); if (!q) return;
    const vp = state.vendors.find(x => x.id === q.vendorId);
    if (!vendorPresent(vp)) { toastr.warning(t('not_present', { vendor: vp ? vp.name : '?' })); return; }
    q.status = 'active'; saveState(); buildInjection(); renderPanel();
    if (settings.autoChatNote) {
        const v = state.vendors.find(x => x.id === q.vendorId);
        insertChatNote(t('cn_accept', { user: getContext().name1 || 'I', vendor: v ? v.name : '?', role: v ? vendorRole(v).toLowerCase() : 'vendor', title: q.title, req: q.requirement, reward: rewardText(q.reward) }));
    }
    toastr.success(t('q_accepted'));
}
function abandonQuest(id) { state.quests = state.quests.filter(q => q.id !== id); saveState(); buildInjection(); renderPanel(); toastr.info(t('q_abandoned')); }
function failQuest(id) { const q = findQuest(id); if (!q) return; q.status = 'failed'; saveState(); buildInjection(); renderPanel(); toastr.warning(t('q_failed')); }
function insertChatNote(text) {
    const ctx = getContext();
    try {
        const msg = {
            name: ctx.name1 || 'You', is_user: true, is_system: false,
            send_date: (typeof ctx.getMessageTimeStamp === 'function') ? ctx.getMessageTimeStamp() : new Date().toISOString(),
            mes: text, extra: {}
        };
        ctx.chat.push(msg);
        if (typeof ctx.addOneMessage === 'function') ctx.addOneMessage(msg);
        if (typeof ctx.saveChat === 'function') ctx.saveChat();
        return true;
    } catch (e) {
        const ta = $('#send_textarea');
        if (ta.length) { ta.val(text).trigger('input'); ta.focus(); }
        return false;
    }
}
function announceQuest(id) {
    const q = findQuest(id); if (!q) return;
    const v = state.vendors.find(x => x.id === q.vendorId);
    insertChatNote(t('cn_accept', { user: getContext().name1 || 'I', vendor: v ? v.name : '?', role: v ? vendorRole(v).toLowerCase() : 'vendor', title: q.title, req: q.requirement, reward: rewardText(q.reward) }));
    toastr.success(t('q_announced'));
}
function completeQuest(id) {
    const q = findQuest(id); if (!q) return;
    if (q.reward && q.reward.kind === 'item') {
        const inv = invApi();
        if (inv) { inv.add({ name: q.reward.name || 'Reward', desc: '' }); toastr.success(t('q_done_item', { name: q.reward.name })); }
        else toastr.warning(t('q_need_inv'));
    } else if (q.reward && q.reward.kind === 'repair') {
        const eq = eqApi(); const slot = mostDamagedSlot();
        if (eq && slot) {
            const amt = Math.max(1, Math.min(100, parseInt(q.reward.amount) || 25));
            const lbl = (eq.repairable().find(g => g.slot === slot) || {}).label || slot;
            eq.repair(slot, amt); toastr.success(t('q_done_repair', { gear: lbl, amount: amt }));
        } else toastr.info(t('q_done_repair_none'));
    } else if (q.reward && q.reward.kind === 'coins') {
        const inv = invApi();
        if (inv) { inv.addCoins(q.reward.amount || 0); toastr.success(t('q_done_coins', { n: q.reward.amount || 0 })); }
        else toastr.warning(t('q_need_inv'));
    } else if (q.reward && q.reward.kind === 'buff') {
        const vit = vitApi();
        if (vit) { vit.addBuff({ name: q.reward.name, effect: q.reward.effect || '', kind: 'buff', duration: q.reward.amount || 3 }); toastr.success(t('q_done_buff', { name: q.reward.name })); }
        else toastr.info(t('q_done_plain', { reward: rewardText(q.reward) }));
    } else {
        toastr.success(t('q_done_plain', { reward: rewardText(q.reward) }));
    }
    q.status = 'done'; saveState(); buildInjection(); renderPanel();
    if (settings.autoChatNote) {
        const v = state.vendors.find(x => x.id === q.vendorId);
        insertChatNote(t('cn_done', { user: getContext().name1 || 'I', vendor: v ? v.name : '?', role: v ? vendorRole(v).toLowerCase() : 'vendor', title: q.title, reward: rewardText(q.reward) }));
    }
}
function sellValue(it) { return Math.max(1, Math.round((it.chance || 30) / 10)); }
async function generateShop(vendor) {
    if (!settings.enabled) return;
    toastr.info(t('shop_gen'));
    try {
        const sys = `You are ${vendor.name}, a ${vendorRole(vendor)}.
Your character and personality: ${vendorPersona(vendor) || ('an ordinary ' + vendorRole(vendor))}.
IMPORTANT — as a ${vendorRole(vendor)} you deal ONLY in: ${vendorDomain(vendor)}. This domain is FIXED by your role; your personality changes only the STYLE and flavour, NEVER the domain (a cook sells food, not clothing; a blacksmith sells metal goods, not pastries).
List 5 goods you sell. They MUST (a) fit the WORLD, ERA, PLACE and technology level of the setting below, AND (b) reflect WHO YOU ARE — your trade combined with your personality, so a different ${vendorRole(vendor)} would stock different things.
Do NOT produce anachronistic or out-of-place goods: e.g. no herbal tonics, swords or torches in a modern city; no smartphones in a medieval village; match the real time period and culture of the setting.
For each good: a short name, a type (weapon, armor, clothing, material, food, consumable, misc), a one-line description, a fair price in coins (integer 1-100), and a realistic "weight" in kg for the real object (a coin ~0.01, a knife ~0.3, a sword ~1.5, armor ~10). For food goods add "food": number (satiety restored). For food/consumable goods you may also add "heal": number and/or "buff": {"name":"","effect":"","duration":turns}.
Write names and descriptions strictly in ${genLang()}.
Output strictly JSON: {"goods":[{"name":"","type":"misc","desc":"","price":10,"weight":1}]}`;
        const res = await callAI(sys, settingContext());
        const goods = Array.isArray(res.goods) ? res.goods : [];
        vendor.stock = goods.slice(0, 8).map(g => ({ id: genId(), name: String(g.name || 'Item'), type: String(g.type || 'misc'), desc: String(g.desc || ''), price: Math.max(1, parseInt(g.price) || 10), weight: (typeof g.weight === 'number' && g.weight > 0) ? g.weight : undefined, heal: (typeof g.heal === 'number' && g.heal > 0) ? g.heal : undefined, food: (typeof g.food === 'number' && g.food > 0) ? g.food : undefined, buff: (g.buff && g.buff.name) ? { name: String(g.buff.name), effect: String(g.buff.effect || ''), duration: (typeof g.buff.duration === 'number' && g.buff.duration > 0) ? g.buff.duration : null } : undefined }));
        saveState(); renderPanel(); toastr.success(t('shop_gen_done'));
    } catch (e) { toastr.error(t('shop_gen_err')); }
}
function buyGood(vendor, goodId) {
    const inv = invApi();
    if (!inv) { toastr.warning(t('no_inv_shop')); return; }
    const good = (vendor.stock || []).find(g => g.id === goodId);
    if (!good) return;
    if (!inv.spendCoins(good.price)) { toastr.warning(t('not_enough')); return; }
    inv.add({ name: good.name, desc: good.desc, type: good.type, weight: good.weight, heal: good.heal, food: good.food, buff: good.buff });
    toastr.success(t('bought', { name: good.name }));
    renderPanel();
}
function sellItem(invId) {
    const inv = invApi();
    if (!inv) { toastr.warning(t('no_inv_shop')); return; }
    const it = inv.list().find(i => i.id === invId);
    if (!it) return;
    const val = sellValue(it);
    inv.remove(invId); inv.addCoins(val);
    toastr.success(t('sold', { name: it.name, n: val }));
    renderPanel();
}
function giveCoins(vendor, amt) {
    const inv = invApi();
    if (!inv) { toastr.warning(t('no_inv_shop')); return; }
    if (!amt || amt <= 0) return;
    if (!inv.spendCoins(amt)) { toastr.warning(t('not_enough')); return; }
    insertChatNote(t('cn_give', { user: getContext().name1 || 'I', vendor: vendor.name, n: amt }));
    toastr.success(t('gave', { n: amt, vendor: vendor.name }));
    renderPanel();
}
// ============================ ICONS ============================
const VI = {
 person:'<circle cx="12" cy="9" r="4"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/>',
 scissors:'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 8l12 12M8 16L20 4"/>',
 utensils:'<path d="M5 3v7a2 2 0 0 0 2 2v9M7 3v7M9 3v7M9 3v9M16 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9"/>',
 coin:'<ellipse cx="12" cy="7" rx="8" ry="3.2"/><path d="M4 7v5c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V7M4 12v5c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', back:'<path d="M15 5l-7 7 7 7"/>', fwd:'<path d="M9 5l7 7-7 7"/>',
 leave:'<path d="M13 4h7v16h-7M3 12h11M9 8l-5 4 5 4"/>',
 wand:'<path d="M5 19L17 7M15 5l4 4M9 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM18 13l.7 1.5L20 15l-1.3.5L18 17l-.7-1.5L16 15l1.3-.5z"/>',
 cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.4 11h10l2-7H6"/>',
 wrench:'<path d="M15 7a4 4 0 0 0-5 5l-6 6 2 2 6-6a4 4 0 0 0 5-5l-2.2 2.2-1.8-1.8L15 7z"/>',
 brief:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
 file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', refresh:'<path d="M4 12a8 8 0 0 1 13-6l2 2M20 12a8 8 0 0 1-13 6l-2-2M18 4v4h-4M6 20v-4h4"/>',
 check:'<path d="M5 12l4 4 10-10"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>', play:'<path d="M8 5v14l11-7z"/>',
 hand:'<path d="M4 12v6h12l4-4M8 12V6a2 2 0 0 1 4 0v4M12 8a2 2 0 0 1 4 0v3"/>', sell:'<path d="M3 12l9-9 9 9-9 9z"/><circle cx="12" cy="12" r="2"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', edit:'<path d="M4 20l4-1L19 8l-3-3L5 16z"/>',
 hammer:'<path d="M14 6l4 4M13 7l4 4-7 7-4-4zM13 7l3-3 4 4-3 3M3 21l7-7"/>',
 gem:'<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l3 16M15 4l-3 16"/>',
 mortar:'<path d="M5 10h14M6 10a6 6 0 0 0 12 0M12 16v4M8 20h8M14 3l3 3"/>',
 store:'<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18"/>'
};
function ic(n, w) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.7}" stroke-linecap="round" stroke-linejoin="round">${VI[n] || VI.person}</svg>`; }
const TYPE_SVG = { blacksmith:'hammer', tailor:'scissors', apothecary:'mortar', cook:'utensils', merchant:'store', jeweler:'gem', other:'person' };
function vIcon(v) { return ic(TYPE_SVG[v && v.type] || 'person'); }
function useTagOf(ty) { return /(food|consum|potion|drink|elixir|еда|расход|зель|напит)/i.test(ty || ''); }

// ============================ UI plumbing ============================
function openVendorShop(vendorId) {
    if (!settings.enabled) return;
    currentVendorId = vendorId; setActive(vendorId);
    view = 'workshop'; tab = 'profile'; selSlot = ''; selItemId = '';
    renderButton(); renderPanel();
    $('#rpg-vnd-modal').addClass('visible');
}
function addVendorButtons() {
    if (!settings.enabled || !state) return;
    $('.mes').each(function () {
        const mesId = $(this).attr('mesid');
        const msg = getContext().chat[mesId];
        if (!msg || msg.is_user || msg.is_system) return;
        const vendor = state.vendors.find(v => v.charName && v.charName === msg.name);
        if (!vendor) return;
        if ($(this).find('.rpg-vnd-mes-btn').length === 0) {
            const btn = $(`<div class="rpg-vnd-mes-btn" title="${escapeHtml(t('mes_btn_title'))}"><i class="fa-solid fa-store"></i></div>`);
            btn.on('click', () => openVendorShop(vendor.id));
            $(this).find('.mes_buttons').prepend(btn);
        }
    });
}
function restoreVendorButtons() { $('.rpg-vnd-mes-btn').remove(); addVendorButtons(); }

function renderButton() {
    if ($('#rpg-vnd-btn').length === 0) {
        $('body').append(`<div class="rpg-floating-btn" id="rpg-vnd-btn" title="${escapeHtml(t('btn_title'))}"><i class="fa-solid fa-store"></i></div>`);
    }
    if ($('#rpg-vnd-modal').length === 0) {
        $('body').append(`
            <div class="rpg-modal rpg-vnd-modal" id="rpg-vnd-modal">
                <div class="rpg-modal-header" id="rpg-vnd-drag"><span><i class="fa-solid fa-store"></i> <span id="rpg-vnd-title">${escapeHtml(t('panel_title'))}</span></span> <i class="fa-solid fa-xmark rpg-modal-close"></i></div>
                <div class="rpg-vnd-body" id="rpg-vnd-body"></div>
            </div>`);
        $('#rpg-vnd-modal .rpg-modal-close').on('click', () => $('#rpg-vnd-modal').removeClass('visible'));
        window.addEventListener('resize', () => { if ($('#rpg-vnd-modal').hasClass('visible')) fitPanel(); });
    }
    if (!settings.enabled) { $('#rpg-vnd-btn').hide(); return; }
    $('#rpg-vnd-btn').show();
    $('#rpg-vnd-btn').off('click').on('click', () => { view = 'list'; renderPanel(); $('#rpg-vnd-modal').toggleClass('visible'); });
}

function makeModalDraggable(elmnt, handle) {
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    if (!handle) return;
    handle.onmousedown = (e) => {
        if (e.target.closest('.rpg-modal-close, .vnf-x, button, input, select, textarea, a')) return;
        e.preventDefault(); p3 = e.clientX; p4 = e.clientY;
        document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
        document.onmousemove = (ev) => {
            ev.preventDefault(); p1 = p3 - ev.clientX; p2 = p4 - ev.clientY; p3 = ev.clientX; p4 = ev.clientY;
            elmnt.style.top = (elmnt.offsetTop - p2) + 'px'; elmnt.style.left = (elmnt.offsetLeft - p1) + 'px';
        };
    };
}

function typeOptions(sel) {
    return VENDOR_TYPES.map(ty => `<option value="${ty}" ${sel === ty ? 'selected' : ''}>${escapeHtml(typeLabel(ty))}</option>`).join('');
}

function fitPanel() {
    const fit = document.querySelector('#rpg-vnd-body .vnf-fit');
    const panel = document.querySelector('#rpg-vnd-body .vnf-panel');
    if (!fit || !panel) return;
    fit.style.transform = 'none';
    fit.style.height = 'auto'; // let the panel take its natural content height before measuring
    const availW = Math.min(472, window.innerWidth * 0.96) - 4;
    const s = Math.min(1, availW / 460); // width-only: never resize by content height (no jumps)
    fit.style.transformOrigin = 'top center';
    fit.style.transform = 'scale(' + s + ')';
    fit.style.height = (panel.offsetHeight * s) + 'px';
}

// ============================ MAIN RENDER ============================
function renderPanel() {
    const body = $('#rpg-vnd-body');
    if (body.length === 0 || !state) return;

    if (body.find('.vnf-panel').length === 0) {
        body.html(`<div class="vnf-fit"><div class="vnf-panel" id="vnf-panel">
            <div class="vnf-tabcorner">${escapeHtml(t('cardfile_tab'))} · <b>${escapeHtml(t('cardfile_tab_b'))}</b></div>
            <div class="vnf-top" id="vnf-drag">
                <div class="vnf-crest">${ic('store', 1.6)}</div>
                <div style="flex:1"><h1>${escapeHtml(t('panel_title'))}</h1><div class="vnf-sub">${escapeHtml(t('subtitle'))}</div></div>
                <button class="vnf-x" id="vnf-close" aria-label="${escapeHtml(t('close_lbl'))}">✕</button>
            </div>
            <div class="vnf-stage"></div>
        </div></div>`);
        body.find('#vnf-close').off('click').on('click', () => $('#rpg-vnd-modal').removeClass('visible'));
        const dragEl = body.find('.vnf-top')[0];
        if (dragEl) makeModalDraggable(document.getElementById('rpg-vnd-modal'), dragEl);
    }
    renderStage();
}

function renderStage() {
    const body = $('#rpg-vnd-body');
    const stageEl = body.find('.vnf-stage');
    if (stageEl.length === 0) return renderPanel();

    let stage;
    if (view === 'form') stage = formStage();
    else if (view === 'workshop') stage = dossierStage();
    else stage = indexStage();
    stageEl.html(stage);

    if (view === 'form') wireForm(body);
    else if (view === 'workshop') wireDossier(body);
    else wireIndex(body);

    fitPanel();
}

// ---------------- INDEX (rolodex) ----------------
function indexStage() {
    const n = state.vendors.length;
    const top = `<div class="vnf-idxtop">
        <button class="vnf-btn b-navy" id="v-create">${ic('plus')}${escapeHtml(t('create'))}</button>
        <select class="vnf-sel" id="v-autotype"><option value="auto">${escapeHtml(t('auto_ai'))}</option>${typeOptions('')}</select>
        <button class="vnf-btn b-violet" id="v-auto">${ic('wand')}${escapeHtml(t('auto'))}</button>
    </div>`;
    if (n === 0) return `<div class="vnf-view">${top}<div class="vnf-emptybig">${escapeHtml(t('no_vendors'))}</div></div>`;
    return `<div class="vnf-view">${top}<div class="vnf-rolo" id="v-rolo">${roloInner()}</div></div>`;
}
function roloInner() {
    const n = state.vendors.length;
    if (vi >= n) vi = 0; if (vi < 0) vi = n - 1;
    const v = state.vendors[vi], pv = state.vendors[(vi - 1 + n) % n], nx = state.vendors[(vi + 1) % n];
    const here = state.activeVendorId === v.id;
    return `<button class="vnf-nav l" id="v-prev">${ic('back')}</button>
        ${n > 1 ? `<div class="vnf-peek l" data-go="${(vi - 1 + n) % n}"><div class="pm">${vIcon(pv)}</div><div class="pn">${escapeHtml(pv.name)}</div></div>
        <div class="vnf-peek r" data-go="${(vi + 1) % n}"><div class="pm">${vIcon(nx)}</div><div class="pn">${escapeHtml(nx.name)}</div></div>` : ''}
        <div class="vnf-card" style="--dir:${dir * 44}px">
          <div class="redline"></div><div class="marg"></div><div class="rules"></div>
          ${here ? `<span class="vnf-here">• ${escapeHtml(t('active_here'))}</span>` : ''}
          <div class="inner">
            <div class="vnf-mug">${vIcon(v)}<span class="clip"></span></div>
            <div class="nm">${escapeHtml(v.name)}</div>
            <div class="ty">${escapeHtml(vendorRole(v))}</div>
            <div class="ds">${escapeHtml(v.desc || '')}</div>
            <button class="vnf-btn b-navy openb" id="v-open">${ic('file')}${escapeHtml(t('open_dossier'))}</button>
          </div>
        </div>
        <button class="vnf-nav r" id="v-next">${ic('fwd')}</button>
        <div class="vnf-counter">${vi + 1} / ${n}</div>`;
}
function wireIndex(body) {
    body.find('#v-create').off('click').on('click', () => { formVendor = null; view = 'form'; renderPanel(); });
    body.find('#v-auto').off('click').on('click', () => autoGenerateVendor(body.find('#v-autotype').val()));
    wireRolo(body);
}
function wireRolo(body) {
    const n = state.vendors.length; if (!n) return;
    const refresh = () => { body.find('#v-rolo').html(roloInner()); wireRolo(body); }; // swap only the carousel -> smooth slide, no panel jump
    body.find('#v-prev').off('click').on('click', () => { dir = -1; vi = (vi - 1 + n) % n; refresh(); });
    body.find('#v-next').off('click').on('click', () => { dir = 1; vi = (vi + 1) % n; refresh(); });
    body.find('.vnf-peek').off('click').on('click', function () { const k = +$(this).data('go'); dir = (k > vi) ? 1 : -1; vi = k; refresh(); });
    body.find('#v-open').off('click').on('click', () => { const v = state.vendors[vi]; currentVendorId = v.id; setActive(v.id); view = 'workshop'; tab = 'profile'; selSlot = ''; selItemId = ''; renderPanel(); });
}

// ---------------- DOSSIER (tabs) ----------------
function dossierStage() {
    const v = state.vendors.find(x => x.id === currentVendorId);
    if (!v) { view = 'list'; return indexStage(); }
    const tabs = [['profile', t('tab_profile'), 'brief'], ['shop', t('tab_shop'), 'cart'], ['jobs', t('tab_jobs'), 'file'], ['repair', t('tab_repair'), 'wrench']];
    return `<div class="vnf-view">
      <div class="vnf-crumb">
        <button class="vnf-btn b-paper" id="v-back">${ic('back')}${escapeHtml(t('back'))}</button>
        <button class="vnf-btn b-ghost" id="v-edit">${ic('edit')}${escapeHtml(t('edit'))}</button>
        <button class="vnf-btn b-red" id="v-del">${ic('trash')}${escapeHtml(t('del'))}</button>
        <button class="vnf-btn b-ghost" id="v-leave">${ic('leave')}${escapeHtml(t('leave'))}</button>
      </div>
      <div class="vnf-tabs">${tabs.map(tb => `<button class="vnf-tab ${tab === tb[0] ? 'active' : ''}" data-t="${tb[0]}">${ic(tb[2])}<span class="lab">${escapeHtml(tb[1])}</span></button>`).join('')}</div>
      <div class="vnf-tabbody" id="v-tb"><div class="vnf-tbin">${tabHtml(v)}</div></div>
    </div>`;
}
function vHead(v) {
    return `<div class="vnf-vhead"><div class="vnf-mug">${vIcon(v)}<span class="clip"></span></div>
        <div><div class="nm">${escapeHtml(v.name)}</div><div class="ty">${escapeHtml(vendorRole(v))}</div></div></div>`;
}
function tabHtml(v) {
    const inv = invApi(), eq = eqApi();
    let h = vHead(v);

    if (tab === 'profile') {
        h += `<div class="vnf-quote">${escapeHtml(v.desc || t('q_none'))}</div>
            <div class="vnf-field"><b>${escapeHtml(t('type_label'))}:</b> ${escapeHtml(vendorRole(v))}</div>
            ${v.customDomain ? `<div class="vnf-field"><b>${escapeHtml(t('trade_lbl'))}</b> ${escapeHtml(v.customDomain)}</div>` : ''}
            <div style="margin-top:14px"><button class="vnf-btn b-violet vnf-askwork" style="width:100%">${ic('wand')}${escapeHtml(t('q_get'))}</button></div>`;
    }
    else if (tab === 'shop') {
        const coins = inv ? inv.getCoins() : 0;
        h += `<div class="vnf-shopbar"><span class="vnf-coins">${ic('coin')} ${coins}</span>
            <button class="vnf-btn b-violet vnf-restock" style="padding:7px 12px;font-size:13px">${ic('refresh')}${escapeHtml(t('restock'))}</button></div>`;
        const stock = v.stock || [];
        h += stock.length ? `<div class="vnf-shopgrid">` + stock.map(g => {
            const u = useTagOf(g.type);
            return `<div class="vnf-scard ${u ? 'use' : ''}">
                <div class="tagline"><span class="vnf-pill ${u ? 'use' : ''}">${escapeHtml(g.type || 'misc')}</span></div>
                <div class="nm"><span class="mark">${escapeHtml(g.name)}</span></div>
                ${g.desc ? `<div class="ds">${escapeHtml(g.desc)}</div>` : ''}
                <div class="foot"><span class="price">${ic('coin')} ${g.price}</span>
                <button class="vnf-btn b-navy buy vnf-buy" data-id="${g.id}">${ic('cart')}${escapeHtml(t('buy'))}</button></div>
            </div>`;
        }).join('') + `</div>` : `<div class="vnf-empty">${escapeHtml(t('no_goods'))}</div>`;
        h += `<div class="vnf-shopfoot">`;
        if (inv) {
            const items = inv.list();
            if (items.length) {
                h += `<div class="vnf-footrow"><span class="lbl">${escapeHtml(t('sell_label'))}</span></div>
                    <div class="vnf-footrow"><select class="vnf-sel vnf-sell-sel" style="flex:1"><option value="">—</option>${items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('')}</select>
                    <button class="vnf-btn b-paper vnf-sell">${ic('sell')}${escapeHtml(t('sell'))}</button></div>`;
            }
            h += `<div class="vnf-footrow"><span class="lbl">${escapeHtml(t('give_label', { vendor: v.name }))}</span></div>
                <div class="vnf-footrow"><input class="vnf-num vnf-give-amt" type="number" min="1" value="10" placeholder="10"><button class="vnf-btn b-violet vnf-give">${ic('hand')}${escapeHtml(t('give_coins'))}</button></div>`;
        }
        h += `</div>`;
    }
    else if (tab === 'jobs') {
        h += `<div class="vnf-sech">${escapeHtml(t('q_section'))}</div>`;
        if (settings.questsNeedPresence) {
            h += `<div class="vnf-footrow" style="margin-bottom:8px"><label class="checkbox_label"><input type="checkbox" class="vnf-presence-cb" ${vendorPresent(v) ? 'checked' : ''}> ${ic('hand')} ${escapeHtml(t('im_here'))}</label></div>`;
        }
        const qs = (state.quests || []).filter(q => q.vendorId === v.id && q.status !== 'done' && q.status !== 'failed').slice(0, 5);
        if (!qs.length) {
            h += `<div class="vnf-empty">${escapeHtml(t('q_none'))}</div>
                <button class="vnf-btn b-violet vnf-getq" style="width:100%">${ic('wand')}${escapeHtml(t('q_get'))}</button>`;
        } else {
            h += qs.map(q => {
                const active = q.status === 'active';
                return `<div class="vnf-quest ${active ? 'active' : ''}">
                    <div class="qn">${escapeHtml(q.title)}</div>
                    ${q.desc ? `<div class="qd">${escapeHtml(q.desc)}</div>` : ''}
                    <div class="meta"><b>${escapeHtml(t('q_req'))}</b> ${escapeHtml(q.requirement)}<br><b>${escapeHtml(t('q_reward'))}</b> ${escapeHtml(rewardText(q.reward))}</div>
                    <div class="acts">${active
                        ? `<button class="vnf-btn b-navy vnf-qdone" data-id="${q.id}">${ic('check')}${escapeHtml(t('q_complete'))}</button>
                           <button class="vnf-btn b-red vnf-qfail" data-id="${q.id}">${ic('x')}${escapeHtml(t('q_fail'))}</button>
                           <button class="vnf-btn b-paper vnf-qsay" data-id="${q.id}">${ic('leave')}${escapeHtml(t('q_announce'))}</button>`
                        : `<button class="vnf-btn b-navy vnf-qaccept" data-id="${q.id}">${ic('play')}${escapeHtml(t('q_accept'))}</button>
                           <button class="vnf-btn b-red vnf-qabandon" data-id="${q.id}">${ic('trash')}${escapeHtml(t('q_abandon'))}</button>`}</div>
                </div>`;
            }).join('');
            h += `<button class="vnf-btn b-violet vnf-getq" style="width:100%;margin-top:4px">${ic('wand')}${escapeHtml(t('q_get'))}</button>`;
        }
    }
    else if (tab === 'repair') {
        h += `<div class="vnf-sech">${escapeHtml(t('repair_title'))}</div>`;
        const targets = [];
        if (eq) for (const g of eq.repairable()) targets.push({ value: 'eq:' + g.slot, label: g.label, name: g.name, broken: g.broken, dur: g.dur, max: g.max });
        if (inv) for (const i of inv.list()) if (typeof i.dur === 'number' && i.dur < i.max) targets.push({ value: 'inv:' + i.id, label: t('in_backpack'), name: i.name, broken: !!i.broken || i.dur <= 0, dur: i.dur, max: i.max });
        if (!eq && !inv) h += `<div class="vnf-empty">${escapeHtml(t('no_eq'))}</div>`;
        else if (!targets.length) h += `<div class="vnf-empty">${escapeHtml(t('nothing_to_repair'))}</div>`;
        else {
            const gearOpts = `<option value="">—</option>` + targets.map(g => `<option value="${g.value}" ${selSlot === g.value ? 'selected' : ''}>${escapeHtml(g.label)}: ${escapeHtml(g.name)} (${g.broken ? '✖ 0%' : Math.round(g.dur / (g.max || 100) * 100) + '%'})</option>`).join('');
            h += `<div class="vnf-footrow"><span class="lbl">${escapeHtml(t('gear_label'))}</span></div>
                <div class="vnf-footrow"><select class="vnf-sel vnf-sel-gear">${gearOpts}</select></div>`;
            if (!inv) h += `<div class="vnf-empty">${escapeHtml(t('no_inv'))}</div>`;
            else {
                const mats = inv.list();
                if (!mats.length) h += `<div class="vnf-empty">${escapeHtml(t('no_items'))}</div>`;
                else {
                    const itemOpts = `<option value="">—</option>` + mats.map(i => `<option value="${i.id}" ${selItemId === i.id ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('');
                    h += `<div class="vnf-footrow"><span class="lbl">${escapeHtml(t('item_label'))}</span></div>
                        <div class="vnf-footrow"><select class="vnf-sel vnf-sel-item">${itemOpts}</select></div>
                        <div class="vnf-footrow"><button class="vnf-btn b-navy vnf-offer" style="width:100%">${ic('wrench')}${escapeHtml(t('offer'))}</button></div>`;
                }
            }
        }
    }
    return h;
}
function wireDossier(body) {
    const v = state.vendors.find(x => x.id === currentVendorId);
    if (!v) return;
    body.find('#v-back').off('click').on('click', () => { view = 'list'; renderPanel(); });
    body.find('#v-leave').off('click').on('click', () => { setActive(null); view = 'list'; renderPanel(); });
    body.find('#v-edit').off('click').on('click', () => { formVendor = v; view = 'form'; renderPanel(); });
    body.find('#v-del').off('click').on('click', () => { deleteVendor(v.id); view = 'list'; renderPanel(); });
    body.find('.vnf-tab').off('click').on('click', function () {
        tab = $(this).data('t');
        body.find('.vnf-tab').removeClass('active');
        $(this).addClass('active');
        body.find('#v-tb').html(`<div class="vnf-tbin">${tabHtml(v)}</div>`); // swap only the tab body -> no jerk, no height jump
        wireTabBody(body, v);
        fitPanel();
    });
    wireTabBody(body, v);
}
function wireTabBody(body, v) {
    // profile
    body.find('.vnf-askwork').off('click').on('click', () => generateQuests(v));
    // shop
    body.find('.vnf-restock').off('click').on('click', () => generateShop(v));
    body.find('.vnf-buy').off('click').on('click', function () { buyGood(v, $(this).data('id')); });
    body.find('.vnf-sell').off('click').on('click', function () { const id = body.find('.vnf-sell-sel').val(); if (id) sellItem(id); });
    body.find('.vnf-give').off('click').on('click', function () { const a = parseInt(body.find('.vnf-give-amt').val()) || 0; giveCoins(v, a); });
    // jobs
    body.find('.vnf-presence-cb').off('change').on('change', function () { state.presentVendorId = this.checked ? v.id : null; saveState(); renderStage(); });
    body.find('.vnf-getq').off('click').on('click', () => generateQuests(v));
    body.find('.vnf-qaccept').off('click').on('click', function () { acceptQuest($(this).data('id')); });
    body.find('.vnf-qabandon').off('click').on('click', function () { abandonQuest($(this).data('id')); });
    body.find('.vnf-qdone').off('click').on('click', function () { completeQuest($(this).data('id')); });
    body.find('.vnf-qfail').off('click').on('click', function () { failQuest($(this).data('id')); });
    body.find('.vnf-qsay').off('click').on('click', function () { announceQuest($(this).data('id')); });
    // repair
    body.find('.vnf-sel-gear').off('change').on('change', function () { selSlot = $(this).val(); });
    body.find('.vnf-sel-item').off('change').on('change', function () { selItemId = $(this).val(); });
    body.find('.vnf-offer').off('click').on('click', () => offerRepair(v));
}

// ---------------- FORM ----------------
function formStage() {
    const v = formVendor || { name: '', type: 'blacksmith', desc: '', charName: '' };
    const cards = (getContext().characters || []).map(c => c.name).filter(Boolean);
    let cardOpts = `<option value="">${escapeHtml(t('pick_card'))}</option>`;
    if (cards.length === 0) cardOpts = `<option value="">${escapeHtml(t('no_cards'))}</option>`;
    else cardOpts += cards.map(nm => `<option value="${escapeHtml(nm)}" ${v.charName === nm ? 'selected' : ''}>${escapeHtml(nm)}</option>`).join('');
    return `<div class="vnf-view">
      <div class="vnf-crumb"><button class="vnf-btn b-paper" id="v-back">${ic('back')}${escapeHtml(t('back'))}</button></div>
      <div class="vnf-rec">
        <div class="vnf-flbl">${escapeHtml(t('link_card'))}</div>
        <select class="vnf-sel vnf-f-card">${cardOpts}</select>
        <input class="vnf-inp" style="margin-top:10px" placeholder="${escapeHtml(t('name_ph'))}" value="${escapeHtml(v.name)}" id="vf-name">
        <div class="vnf-flbl">${escapeHtml(t('type_label'))}</div>
        <select class="vnf-sel vnf-f-type">${typeOptions(v.type)}</select>
        <input class="vnf-inp" style="margin-top:10px" placeholder="${escapeHtml(t('custom_type'))}" value="${escapeHtml(v.customType || '')}" id="vf-ctype">
        <input class="vnf-inp" placeholder="${escapeHtml(t('custom_domain'))}" value="${escapeHtml(v.customDomain || '')}" id="vf-cdom">
        <div style="text-align:right;margin:8px 0"><button class="vnf-btn b-violet vnf-gendesc">${ic('wand')}${escapeHtml(t('gen_desc'))}</button></div>
        <textarea class="vnf-inp vnf-f-desc" placeholder="${escapeHtml(t('desc_ph'))}">${escapeHtml(v.desc)}</textarea>
      </div>
      <div class="vnf-formacts">
        <button class="vnf-btn b-navy vnf-f-save">${ic('check')}${escapeHtml(t('save'))}</button>
        <button class="vnf-btn b-paper" id="v-cancel">${ic('x')}${escapeHtml(t('cancel'))}</button>
      </div>
    </div>`;
}
function wireForm(body) {
    const home = () => { view = 'list'; renderPanel(); };
    body.find('#v-back').off('click').on('click', home);
    body.find('#v-cancel').off('click').on('click', home);
    body.find('.vnf-f-card').off('change').on('change', function () {
        const cn = $(this).val(); const nm = body.find('#vf-name');
        if (cn && !nm.val().trim()) nm.val(cn);
    });
    body.find('.vnf-gendesc').off('click').on('click', () => generateVendorDesc(body));
    body.find('.vnf-f-save').off('click').on('click', function () {
        const nv = {
            id: formVendor ? formVendor.id : null,
            charName: body.find('.vnf-f-card').val() || '',
            name: body.find('#vf-name').val().trim() || (body.find('.vnf-f-card').val() || ''),
            type: body.find('.vnf-f-type').val(),
            customType: body.find('#vf-ctype').val().trim(),
            customDomain: body.find('#vf-cdom').val().trim(),
            desc: body.find('.vnf-f-desc').val().trim()
        };
        if (saveVendor(nv)) { view = 'list'; renderPanel(); restoreVendorButtons(); }
    });
}


// ---- settings ----
function settingsHtml() {
    return `
<div class="extension_settings rpg-vnd-settings">
    <div class="inline-drawer">
        <div class="rpg-vnd-toggle inline-drawer-header" style="cursor: pointer;">
            <b><i class="fa-solid fa-store"></i> ${t('set_title')}</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none; padding-top: 10px;">
            <label class="checkbox_label"><input type="checkbox" id="rpg-vnd-enabled"> ${t('set_enable')}</label>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10" style="margin-top:8px;">
                <label>${t('set_lang')}</label>
                <select id="rpg-vnd-lang" class="text_pole" style="width:auto;">
                    <option value="en">English</option>
                    <option value="ru">Русский</option>
                </select>
            </div>
            <hr class="sysHR">
            <h4>🔌 ${t('set_api')}</h4>
            <input type="text" id="rpg-vnd-base" class="text_pole margin-b-10" placeholder="${t('set_url')}" style="width:100%;">
            <input type="password" id="rpg-vnd-key" class="text_pole margin-b-10" placeholder="${t('set_key')}" style="width:100%;">
            <input type="text" id="rpg-vnd-model" class="text_pole margin-b-10" placeholder="${t('set_model')}" style="width:100%;">
            <hr class="sysHR">
            <div class="flex-container alignitemscenter flexgap5 margin-b-10">
                <label>${t('set_depth')}</label>
                <input type="number" id="rpg-vnd-depth" class="text_pole" min="0" style="width:55px;">
            </div>
            <label class="checkbox_label"><input type="checkbox" id="rpg-vnd-autonote"> ${t('set_autonote')}</label>
            <label class="checkbox_label"><input type="checkbox" id="rpg-vnd-cardinject"> ${t('set_cardinject')}</label>
            <label class="checkbox_label"><input type="checkbox" id="rpg-vnd-questglobal"> ${t('set_questglobal')}</label>
            <label class="checkbox_label"><input type="checkbox" id="rpg-vnd-needpresence"> ${t('set_needpresence')}</label>
        </div>
    </div>
</div>`;
}

function setupUI() {
    $('#extensions_settings').append(settingsHtml());
    $('.rpg-vnd-settings .rpg-vnd-toggle').on('click', function () {
        $(this).next('.inline-drawer-content').slideToggle();
        $(this).find('.inline-drawer-icon').toggleClass('down up');
    });
    $('#rpg-vnd-enabled').prop('checked', settings.enabled).on('change', function () {
        settings.enabled = this.checked; saveSettings(); renderButton(); loadState(); buildInjection();
    });
    $('#rpg-vnd-lang').val(settings.language || 'en').on('change', function () {
        settings.language = $(this).val(); saveSettings();
        $('.rpg-vnd-settings').remove(); setupUI();
        $('.rpg-vnd-settings .inline-drawer-content').show();
        $('.rpg-vnd-settings .inline-drawer-icon').removeClass('down').addClass('up');
        $('#rpg-vnd-btn').attr('title', t('btn_title')); $('#rpg-vnd-title').text(t('panel_title'));
        renderPanel(); buildInjection();
    });
    $('#rpg-vnd-base').val(settings.baseUrl).on('change', function () { settings.baseUrl = $(this).val(); saveSettings(); });
    $('#rpg-vnd-key').val(settings.apiKey).on('change', function () { settings.apiKey = $(this).val(); saveSettings(); });
    $('#rpg-vnd-model').val(settings.model).on('change', function () { settings.model = $(this).val(); saveSettings(); });
    $('#rpg-vnd-depth').val(settings.injectDepth).on('change', function () { settings.injectDepth = parseInt($(this).val()); saveSettings(); buildInjection(); buildCardInjection(); });
    $('#rpg-vnd-autonote').prop('checked', settings.autoChatNote !== false).on('change', function () { settings.autoChatNote = this.checked; saveSettings(); });
    $('#rpg-vnd-cardinject').prop('checked', settings.cardInject !== false).on('change', function () { settings.cardInject = this.checked; saveSettings(); buildInjection(); buildCardInjection(); });
    $('#rpg-vnd-questglobal').prop('checked', settings.questGlobal !== false).on('change', function () { settings.questGlobal = this.checked; saveSettings(); buildInjection(); });
    $('#rpg-vnd-needpresence').prop('checked', !!settings.questsNeedPresence).on('change', function () { settings.questsNeedPresence = this.checked; saveSettings(); renderPanel(); });
}

jQuery(() => {
    loadSettings();
    setupUI();
    if (getContext().chatId) { loadState(); renderButton(); buildInjection(); buildCardInjection(); restoreVendorButtons(); }

    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => { loadState(); view = 'list'; renderButton(); renderPanel(); buildInjection(); buildCardInjection(); restoreVendorButtons(); }, 100);
    });
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => restoreVendorButtons());
    eventSource.on(event_types.MESSAGE_EDITED, () => restoreVendorButtons());
    eventSource.on(event_types.GENERATION_STARTED, () => { try { buildCardInjection(); } catch (e) {} });
});

import { getContext, extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_roles, characters } from '../../../../script.js';

const MODULE_NAME = 'rpg_vendors';
const PROMPT_KEY = 'rpg_vendor_injection';
const PROMPT_KEY_Q = 'rpg_vendor_quest_injection';
const PROMPT_KEY_CARD = 'rpg_vendor_card_injection';
const VENDOR_TYPES = ['blacksmith', 'tailor', 'apothecary', 'cook', 'merchant', 'jeweler', 'trainer', 'other'];
const TYPE_ICONS = { blacksmith: 'fa-hammer', tailor: 'fa-scissors', apothecary: 'fa-mortar-pestle', cook: 'fa-utensils', merchant: 'fa-store', jeweler: 'fa-gem', trainer: 'fa-dumbbell', other: 'fa-user' };

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
    requireAiCheck: false,
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
        tab_recipes: 'Recipes', skill_lbl: 'Skill', lvl_short: 'Lv', recipes_gen: '✨ Generate recipes (AI)', recipes_none: 'No recipes yet — generate some.', recipe_ing: 'Ingredients:', recipe_res: 'Result:', r_learn: 'Learn', r_known: 'Known', recipes_gen_run: 'The vendor jots down recipes...', recipes_gen_done: 'Recipes added!', recipes_gen_err: 'Could not generate — check URL / key / model.', r_learned: 'Learned "{name}" (+{xp} skill XP).', skill_up: '{skill} is now level {lvl}!',
        tab_craft: 'Craft', tab_train: 'Training',
        ing_section: 'Ingredients', ing_gen: '✨ Generate ingredients (AI)', ing_none: 'No ingredient list yet.', ing_gather: '🔍 Gather one', ing_where: 'Found:', ing_got: 'Found: {name} ({where}).', ing_gen_run: 'Cataloguing ingredients...', ing_gen_done: 'Ingredients catalogued!', ing_need_recipes: 'Generate recipes first — ingredients come from them.', ing_goto: '{name} is found at {where}. Go there to gather it.', forage_take: '🔎 Take foraging quest', forage_run: 'Marking ingredients to forage...', forage_started: 'Hunt started — {n} ingredient(s). Search scenes with the 🔍 loupe.', forage_none_missing: 'You already have (or are hunting) everything these recipes need.', forage_need_recipe: 'Learn a recipe first — the hunt is for its ingredients.', forage_need_quest: 'The inventory / quest engine is not available.', forage_active: 'Foraging — look for:', forage_hint: 'Use the 🔍 loupe on scene messages to find these (better in the right place).',
        craft_section: 'Craft a recipe', craft_recipe_lbl: 'Known recipe:', craft_btn: 'Craft', sharpen_btn: '⚒ Sharpen', sharpen_pick: 'Item to sharpen:', sharpen_choose: '— choose a piece —', sharpen_none: 'No equipped piece is at the right grade for this.', sharpen_noeq: 'Equipment module not available.', sharpen_risky: '⚠ Reaching Legendary can fail (materials are lost).', sharpen_need_target: 'Choose an item to sharpen first.', sharpen_ok: 'Sharpened! Now {grade}.', sharpen_fail: 'The sharpening failed — materials lost.', sharpen_tag: '⚒ → {grade}', sharpen_recipe_desc: 'A reforging procedure that upgrades a {cat} to {grade} (one tier up). Learn it, gather its materials, then sharpen at the bench.', sharpen_cat_weapon: 'weapon', sharpen_cat_armor: 'piece of armour', repair_btn: '🛠 Repair', repair_pick: 'Item to repair:', repair_none: 'Nothing of this kind needs repair.', repair_broken: 'broken', repair_ok: 'Repaired — good as new.', repair_fail: 'Nothing to repair.', repair_tag: '🛠 kit', repair_recipe_desc: 'A repair kit that restores the durability of a {cat}. Learn it, gather materials, then mend at the bench.', craft_need: 'Missing: {list}', craft_none_known: 'Learn a recipe first (Recipes tab).', craft_known_h: 'You can craft:', craft_locked_h: 'Not yet learned:', r_locked_hint: 'Learn in the Recipes tab.', open_bench: '⚗️ Open crafting bench', bench_tabhint: 'Recipes, ingredients and crafting open in a full workbench.', recipes_side: 'Recipes', ingredients_side: 'Ingredients', brew_hint: 'Pick a recipe on the left, or Freestyle to experiment.', cb_perfect: 'Exquisite!', cb_good: 'Good', cb_bad: 'Scorched…', cb_closed: 'Circle closed — hit Craft', cb_fill: 'Close the circle with ingredients', cb_cookhint: 'STOP THE FLAME IN THE GOLD ZONE — tap STOP or Space', cb_stop: 'STOP!', cb_needed: 'needed for the recipe', cb_ingredient: 'ingredient', craft_done: 'Crafted {name}!', craft_run: 'Working the craft...', craft_botched: 'Botched it — got {name} instead.', q_sloppy: 'Too sloppy — no reward. Try again.', craft_err: 'Craft failed — check URL / key / model.', brokendrop_toast: 'A broken {name} fell into your pack — someone could repair it.', brokendrop_qtitle: 'Repair: {name}', brokendrop_qdesc: 'Bring the broken {name} to {vendor} to be mended.', brokendrop_qreq: 'Have {vendor} repair the {name}.', brokendrop_note: '*[{user} finds a broken {name} — best take it to {vendor} the {role} for repair.]*', brokendrop_note_novendor: '*[{user} finds a broken {name} — it needs repairing by a craftsman.]*',
        free_section: 'Experiment (freestyle)', free_hint: 'Pick 2–4 materials and try your luck — result unknown.', free_btn: 'Experiment', free_pick: 'Pick at least 2 materials.', free_success: 'Success! Made {name}.', free_fail: 'It went wrong — {name}.', no_materials: 'No materials in your backpack.',
        mini_title: 'Steady hands...', mini_hint: 'Tap when the marker hits the glowing zone.', mini_tap: 'TAP', mini_left: 'Hits left: {n}', mini_cancel: 'Cancel',
        train_section: 'Training', train_drill: '🥊 Pay & train ({n})', train_spar: '⚔️ Log a story sparring (free)', train_done: 'Good session — +{xp} to {skill}.', train_buff_eff: 'Sharpened form from recent {skill} training.', train_paid: 'Trained ({n}) — +{xp} to {skill}.', train_story: 'From the story — +{xp} to {skill} (no pay).', train_perk: 'Trained: {skill}', train_perk_eff: 'Permanent {skill} mastery (level {lvl}).', train_perk_got: 'Permanent gain from {skill} training!', train_note: 'Paid drills give XP and a permanent perk on level-up. Story sparring is free XP only.', train_gen: '✨ Generate training program', train_regen: 'New program', train_gen_run: 'Designing the program...', train_gen_done: 'Program ready!', train_empty: 'No training program yet — generate one to get lessons.', train_note2: 'Practice runs a quick mini-game. Field: play it out in the story, then press Check — the trainer will notice.', q_practice: '🥊 Practice', q_check: '✔️ Check', q_locked: 'Locked', q_lockedlv: 'Reach level {lv}', q_done: 'Done', q_kind: 'Type:', q_kind_field: 'Field (roleplay)', q_kind_practice: 'Practice (mini-game)', q_pass: 'Passed! {why}', q_notyet: 'Not done yet. {why}', q_checking: 'Reviewing the scene...', q_no_scene: 'No recent scene to check.', q_reward_got: 'Reward: {list}', q_rew_buff: 'Buff', q_rew_item: 'Item', cn_train_done: '*[{user} completed {vendor}\'s training lesson: "{title}" — {desc} ({skill}). Reward: {reward}.]*', cn_train_take: '*[{user} takes on {vendor}\'s training task: "{title}" — {desc} ({skill}).]*', q_take: '🥋 Take', q_taken: 'Task taken — play it out, then finish it.', q_idid: '✔️ I did it', q_active_hint: 'Taken — play it out in the story, then "I did it" or Check.', q_need_ai: 'This trainer requires an AI review — press Check.', q_decline: 'Decline', q_failed_note: 'You dropped the lesson — a new one is set, and it stung.', train_main_sec: 'Main lessons', train_drill_sec: 'Drills', train_can_advance: 'Both main lessons done — ready to rise a level! Finish them to advance.', train_levelup: '{skill} rose to level {lvl}! New lessons unlocked.', train_fail_debuff: 'Setback in {skill}', train_fail_debuff_eff: 'Shaken confidence after a botched lesson', drill_regen: '🎲 New drills', drill_empty: 'No drills yet — roll some.', drill_gen_run: 'Setting drills...', drill_gen_done: 'Drills ready!', drill_done: 'Drill done — +{xp} XP.', drill_failed: 'Skipped the drill.', drill_skipped: 'skipped', drill_dropped: 'Dropped that exercise.',
        mini_r_title: 'Quick hands', mini_r_wait: 'Wait for the signal...', mini_r_go: 'NOW — tap!', mini_r_early: 'Too soon!', mini_round: 'Round {n}/{m}', mini_s_title: 'Follow the drill', mini_s_watch: 'Watch the sequence...', mini_s_repeat: 'Now repeat it!', mini_s_good: 'Right!', mini_s_bad: 'Missed!',
        btn_title: 'Vendors & Workshops', panel_title: 'Vendors & Workshops', subtitle: 'CONTACT CARD FILE', cardfile_tab: 'CARD FILE', cardfile_tab_b: 'VENDORS', tab_profile: 'Profile', tab_shop: 'Shop', tab_jobs: 'Jobs', tab_repair: 'Repair', open_dossier: 'Open dossier', trade_lbl: 'TRADE:', close_lbl: 'Close',
        type_blacksmith: 'Blacksmith', type_tailor: 'Tailor', type_apothecary: 'Apothecary',
        type_cook: 'Cook', type_merchant: 'Merchant', type_jeweler: 'Jeweler', type_trainer: 'Trainer', type_other: 'Vendor',
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
        set_autonote: 'Write quest/shop notes into the chat', set_reqai: 'Field lessons: require AI review (hide "I did it")',
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
        tab_recipes: 'Рецепты', skill_lbl: 'Навык', lvl_short: 'Ур', recipes_gen: '✨ Сгенерировать рецепты (ИИ)', recipes_none: 'Рецептов пока нет — сгенерируй.', recipe_ing: 'Ингредиенты:', recipe_res: 'Результат:', r_learn: 'Изучить', r_known: 'Изучено', recipes_gen_run: 'Вендор набрасывает рецепты...', recipes_gen_done: 'Рецепты добавлены!', recipes_gen_err: 'Не удалось — проверь URL / ключ / модель.', r_learned: 'Изучен «{name}» (+{xp} к навыку).', skill_up: 'Навык «{skill}» вырос до уровня {lvl}!',
        tab_craft: 'Крафт', tab_train: 'Тренировка',
        ing_section: 'Ингредиенты', ing_gen: '✨ Сгенерировать ингредиенты (ИИ)', ing_none: 'Списка ингредиентов пока нет.', ing_gather: '🔍 Добыть один', ing_where: 'Где:', ing_got: 'Найдено: {name} ({where}).', ing_gen_run: 'Собираю список ингредиентов...', ing_gen_done: 'Ингредиенты добавлены!', ing_need_recipes: 'Сначала сгенерируй рецепты — ингредиенты берутся из них.', ing_goto: '«{name}» находится: {where}. Иди туда, чтобы добыть.', forage_take: '🔎 Взять задание на сбор', forage_run: 'Отмечаю ингредиенты для сбора...', forage_started: 'Задание взято — {n} ингр. Ищи их лупой 🔍 в сценах.', forage_none_missing: 'Всё нужное для этих рецептов у тебя уже есть или уже в поиске.', forage_need_recipe: 'Сначала изучи рецепт — задание собирает его ингредиенты.', forage_need_quest: 'Движок инвентаря/заданий недоступен.', forage_active: 'Сбор — ищи:', forage_hint: 'Наводи лупу 🔍 на сообщения сцены, чтобы найти их (в нужном месте шанс выше).',
        craft_section: 'Скрафтить рецепт', craft_recipe_lbl: 'Изученный рецепт:', craft_btn: 'Скрафтить', sharpen_btn: '⚒ Заточить', sharpen_pick: 'Что точим:', sharpen_choose: '— выбери вещь —', sharpen_none: 'Нет надетой вещи нужного грейда для этого.', sharpen_noeq: 'Модуль экипировки недоступен.', sharpen_risky: '⚠ Заточка до Легендарного может провалиться (материалы сгорят).', sharpen_need_target: 'Сначала выбери, что точить.', sharpen_ok: 'Заточено! Теперь {grade}.', sharpen_fail: 'Заточка провалилась — материалы сгорели.', sharpen_tag: '⚒ → {grade}', sharpen_recipe_desc: 'Обряд перековки: поднимает {cat} до «{grade}» (на ступень выше). Выучи, собери материалы и заточи на верстаке.', sharpen_cat_weapon: 'оружие', sharpen_cat_armor: 'броню', repair_btn: '🛠 Repair', repair_pick: 'Item to repair:', repair_none: 'Nothing of this kind needs repair.', repair_broken: 'broken', repair_ok: 'Repaired — good as new.', repair_fail: 'Nothing to repair.', repair_tag: '🛠 kit', repair_recipe_desc: 'Ремонтный набор: восстанавливает прочность {cat}. Выучи, собери материалы и почини на верстаке.', craft_need: 'Не хватает: {list}', craft_none_known: 'Сначала изучи рецепт (вкладка «Рецепты»).', craft_known_h: 'Можно скрафтить:', craft_locked_h: 'Ещё не изучено:', r_locked_hint: 'Изучи во вкладке «Рецепты».', open_bench: '⚗️ Открыть верстак', bench_tabhint: 'Рецепты, ингредиенты и крафт открываются в отдельном верстаке.', recipes_side: 'Рецепты', ingredients_side: 'Ингредиенты', brew_hint: 'Выбери рецепт слева или Фристайл для эксперимента.', cb_perfect: 'Изысканно!', cb_good: 'Хорошо', cb_bad: 'Подгорело…', cb_closed: 'Круг замкнут — жми «Скрафтить»', cb_fill: 'Замкни круг ингредиентами', cb_cookhint: 'ОСТАНОВИ ПЛАМЯ В ЗОЛОТОЙ ЗОНЕ — жми СТОП или пробел', cb_stop: 'СТОП!', cb_needed: 'нужен для рецепта', cb_ingredient: 'ингредиент', craft_done: 'Скрафчено: {name}!', craft_run: 'Идёт работа...', craft_botched: 'Испортил — вышло «{name}».', q_sloppy: 'Слишком небрежно — без награды. Попробуй ещё.', craft_err: 'Не удалось — проверь URL / ключ / модель.', brokendrop_toast: 'В рюкзак попал сломанный «{name}» — кто-нибудь мог бы его починить.', brokendrop_qtitle: 'Починка: {name}', brokendrop_qdesc: 'Отнеси сломанный «{name}» к {vendor} на починку.', brokendrop_qreq: 'Починить «{name}» у {vendor}.', brokendrop_note: '*[{user} находит сломанный «{name}» — стоит отнести его на починку к {vendor} ({role}).]*', brokendrop_note_novendor: '*[{user} находит сломанный «{name}» — его нужно починить у мастера.]*',
        free_section: 'Эксперимент (без рецепта)', free_hint: 'Выбери 2–4 материала и попытай удачу — результат неизвестен.', free_btn: 'Поэкспериментировать', free_pick: 'Выбери минимум 2 материала.', free_success: 'Успех! Получилось: {name}.', free_fail: 'Не вышло — {name}.', no_materials: 'В рюкзаке нет материалов.',
        mini_title: 'Твёрдая рука...', mini_hint: 'Жми, когда бегунок в светящейся зоне.', mini_tap: 'ЖМИ', mini_left: 'Осталось: {n}', mini_cancel: 'Отмена',
        train_section: 'Тренировка', train_drill: '🥊 Тренировка за плату ({n})', train_spar: '⚔️ Засчитать сюжетный спарринг (бесплатно)', train_done: 'Хорошая сессия — +{xp} к «{skill}».', train_buff_eff: 'Отточенная форма после тренировки «{skill}».', train_paid: 'Тренировка ({n}) — +{xp} к «{skill}».', train_story: 'Из сюжета — +{xp} к «{skill}» (без оплаты).', train_perk: 'Обучен: {skill}', train_perk_eff: 'Перманентное мастерство «{skill}» (ур. {lvl}).', train_perk_got: 'Перманентная награда за «{skill}»!', train_note: 'Платные тренировки дают опыт и перманентный перк при повышении уровня. Сюжетный спарринг — только бесплатный опыт.', train_gen: '✨ Составить программу тренировок', train_regen: 'Новая программа', train_gen_run: 'Составляю программу...', train_gen_done: 'Программа готова!', train_empty: 'Программы тренировок ещё нет — составь, чтобы появились уроки.', train_note2: 'Практика запускает мини-игру. Полевое: отыграй в сюжете и нажми «Проверить» — тренер это заметит.', q_practice: '🥊 Практика', q_check: '✔️ Проверить', q_locked: 'Закрыто', q_lockedlv: 'Нужен уровень {lv}', q_done: 'Готово', q_kind: 'Тип:', q_kind_field: 'Полевое (отыгрыш)', q_kind_practice: 'Практика (мини-игра)', q_pass: 'Зачёт! {why}', q_notyet: 'Ещё не выполнено. {why}', q_checking: 'Читаю сцену...', q_no_scene: 'Нет свежей сцены для проверки.', q_reward_got: 'Награда: {list}', q_rew_buff: 'Бафф', q_rew_item: 'Предмет', cn_train_done: '*[{user} выполнил у {vendor} урок тренировки: «{title}» — {desc} ({skill}). Награда: {reward}.]*', cn_train_take: '*[{user} берётся за тренировку у {vendor}: «{title}» — {desc} ({skill}).]*', q_take: '🥋 Взять', q_taken: 'Задание взято — отыграй, потом заверши.', q_idid: '✔️ Я выполнила', q_active_hint: 'Взято — отыграй в сюжете, затем «Я выполнила» или «Проверить».', q_need_ai: 'Этот тренер требует ИИ-осмотр — нажми «Проверить».', q_decline: 'Отказаться', q_failed_note: 'Ты бросила урок — назначен новый, и это ударило по тебе.', train_main_sec: 'Основные уроки', train_drill_sec: 'Дриллы', train_can_advance: 'Оба основных урока пройдены — можно повысить уровень! Заверши их, чтобы подняться.', train_levelup: 'Навык «{skill}» вырос до уровня {lvl}! Открыты новые уроки.', train_fail_debuff: 'Осечка в «{skill}»', train_fail_debuff_eff: 'Пошатнувшаяся уверенность после сорванного урока', drill_regen: '🎲 Новые дриллы', drill_empty: 'Дриллов пока нет — сгенерируй.', drill_gen_run: 'Составляю дриллы...', drill_gen_done: 'Дриллы готовы!', drill_done: 'Дрилл выполнен — +{xp} XP.', drill_failed: 'Дрилл пропущен.', drill_skipped: 'пропущен', drill_dropped: 'Упражнение отброшено.',
        mini_r_title: 'Быстрые руки', mini_r_wait: 'Жди сигнала...', mini_r_go: 'ДАВАЙ — жми!', mini_r_early: 'Рано!', mini_round: 'Раунд {n}/{m}', mini_s_title: 'Повтори приём', mini_s_watch: 'Смотри последовательность...', mini_s_repeat: 'Теперь повтори!', mini_s_good: 'Верно!', mini_s_bad: 'Мимо!',
        btn_title: 'Вендоры и мастерские', panel_title: 'Вендоры и мастерские', subtitle: 'КАРТОТЕКА КОНТАКТОВ', cardfile_tab: 'КАРТОТЕКА', cardfile_tab_b: 'ВЕНДОРЫ', tab_profile: 'Профиль', tab_shop: 'Лавка', tab_jobs: 'Задания', tab_repair: 'Починка', open_dossier: 'Открыть досье', trade_lbl: 'РЕМЕСЛО:', close_lbl: 'Закрыть',
        type_blacksmith: 'Оружейник', type_tailor: 'Портной', type_apothecary: 'Аптекарь',
        type_cook: 'Кулинар', type_merchant: 'Торговец', type_jeweler: 'Ювелир', type_trainer: 'Тренер', type_other: 'Вендор',
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
        set_autonote: 'Писать заметки о квестах/лавке в чат', set_reqai: 'Полевые уроки: требовать ИИ-осмотр (скрыть «Я выполнила»)',
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

async function callAI(systemPrompt, userPrompt, tempOverride) {
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
                    temperature: (typeof tempOverride === 'number') ? tempOverride : settings.temperature,
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
function mapApi() { return (window.RPG && window.RPG.map && window.RPG.map.available) ? window.RPG.map : null; }

function typeLabel(ty) { return t('type_' + (VENDOR_TYPES.includes(ty) ? ty : 'other')); }
const TYPE_DOMAIN = {
    blacksmith: 'weapons, armour, metal tools, forging and metal repairs, ore and metal materials',
    tailor: 'clothing, garments, fabric, leather goods and sewing',
    apothecary: 'medicines, potions, tonics, herbs, poisons and healing remedies',
    cook: 'food, meals, ingredients, spices, drinks and things from the kitchen',
    merchant: 'general goods, supplies, trinkets and everyday wares',
    jeweler: 'jewellery, gems, precious metals and fine accessories',
    trainer: 'physical training, combat drills and techniques (blades, magic, boxing, dance and the like)',
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
        let desc = res && (res.desc || res.description || (typeof res === 'string' ? res : ''));
        if (!desc || !String(desc).trim()) { // one retry, a touch hotter, before giving up
            const res2 = await callAI(sys, settingContext(), Math.min(1.1, (typeof settings.temperature === 'number' ? settings.temperature : 0.7) + 0.2));
            desc = res2 && (res2.desc || res2.description || (typeof res2 === 'string' ? res2 : ''));
        }
        if (desc && String(desc).trim()) { body.find('.rpg-vnd-f-desc').val(String(desc).trim()); toastr.success(t('desc_gen_done')); }
        else toastr.error(t('desc_gen_err'));
    } catch (e) { console.error('[Vendors] desc gen failed:', e); toastr.error(t('desc_gen_err')); }
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
        if (idx >= 0) {
            // editing must NEVER wipe this vendor's own progress — carry it over if the form didn't include it
            const old = state.vendors[idx] || {};
            ['recipes', 'skill', 'training', 'drills', 'stock', 'ingredients', 'seenGoods', 'quests', 'jobs'].forEach(k => { if (v[k] === undefined && old[k] !== undefined) v[k] = old[k]; });
            state.vendors[idx] = v;
        } else state.vendors.push(v);
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
Offer the player 4-5 short side-quests that come from WHO YOU ARE — your trade as a ${vendorRole(vendor)} combined with your personality and the setting below (no anachronisms). Make them SPECIFIC to this vendor: a different ${vendorRole(vendor)} would ask for different things. Avoid generic "go fetch X" tasks that any vendor could give; tie each quest to your character. They should mostly involve fetching/bringing materials, delivering, or helping with your craft.
For each quest give: a short title, a one-sentence description, the concrete requirement (what to bring or do), and a reward.
Reward "kind" is one of: "item" (object added to backpack — set name), "repair" (durability restored — set amount 10-100), "coins" (set amount 1-100), or "buff" (a positive effect — set name, a short "effect" text, and amount = how many turns it lasts).
VARY the reward kinds across the quests — include AT LEAST one that pays "coins" and AT LEAST one that grants a "buff", alongside item/repair ones. Do not make them all the same kind.
Write EVERYTHING strictly in ${genLang()}.
Output strictly JSON: {"quests":[{"type":"fetch","title":"","desc":"","requirement":"","reward":{"kind":"item","name":"","effect":"","amount":0}}]}`;
        const res = await callAI(sys, settingContext());
        const arr = Array.isArray(res.quests) ? res.quests : [];
        let added = 0;
        for (const q of arr.slice(0, 5)) {
            const title = String(q.title || '').trim(); const requirement = String(q.requirement || '').trim();
            if (!title || !requirement) continue; // skip malformed/empty quests — never show a blank card
            const rk = (q.reward && ['item', 'repair', 'buff', 'coins'].includes(q.reward.kind)) ? q.reward.kind : 'item';
            state.quests.push({
                id: genId(), vendorId: vendor.id, type: q.type || 'fetch',
                title, desc: String(q.desc || ''), requirement,
                reward: { kind: rk, name: String(q.reward && q.reward.name || 'Material'), effect: String(q.reward && q.reward.effect || ''), amount: parseInt(q.reward && q.reward.amount) || 25 },
                status: 'available'
            });
            added++;
        }
        saveState(); renderPanel();
        if (added) toastr.success(t('q_gen_done')); else toastr.error(t('q_gen_err'));
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
    // remember everything this vendor has stocked before, so re-rolls don't repeat themselves
    if (!Array.isArray(vendor.seenGoods)) vendor.seenGoods = [];
    (vendor.stock || []).forEach(s => { const n = String(s.name || '').trim(); if (n && !vendor.seenGoods.some(x => x.toLowerCase() === n.toLowerCase())) vendor.seenGoods.push(n); });
    const avoid = vendor.seenGoods.slice(-40);
    try {
        const sys = `You are ${vendor.name}, a ${vendorRole(vendor)}.
Your character and personality: ${vendorPersona(vendor) || ('an ordinary ' + vendorRole(vendor))}.
IMPORTANT — as a ${vendorRole(vendor)} you deal ONLY in: ${vendorDomain(vendor)}. This domain is FIXED by your role; your personality changes only the STYLE and flavour, NEVER the domain (a cook sells food, not clothing; a blacksmith sells metal goods, not pastries).
List 5 goods you sell. They MUST (a) fit the WORLD, ERA, PLACE and technology level of the setting below, AND (b) reflect WHO YOU ARE — your trade combined with your personality, so a different ${vendorRole(vendor)} would stock different things.
Do NOT produce anachronistic or out-of-place goods: e.g. no herbal tonics, swords or torches in a modern city; no smartphones in a medieval village; match the real time period and culture of the setting.
${avoid.length ? `You have sold these before — offer DIFFERENT, fresh goods, not these or near-duplicates of them: ${avoid.join(', ')}.` : ''}
For each good: a short name, a type (weapon, armor, clothing, material, food, consumable, misc), a one-line description, a fair price in coins (integer 1-100), and a realistic "weight" in kg for the real object (a coin ~0.01, a knife ~0.3, a sword ~1.5, armor ~10). For food goods add "food": number (satiety restored). For food/consumable goods you may also add "heal": number and/or "buff": {"name":"","effect":"","duration":turns}.
Write names and descriptions strictly in ${genLang()}.
Output strictly JSON: {"goods":[{"name":"","type":"misc","desc":"","price":10,"weight":1}]}`;
        // a touch hotter than usual so re-rolls vary; capped so it doesn't go incoherent
        const temp = Math.min(1.15, (typeof settings.temperature === 'number' ? settings.temperature : 0.7) + 0.25);
        const res = await callAI(sys, settingContext(), temp);
        const goods = Array.isArray(res.goods) ? res.goods : [];
        vendor.stock = goods.slice(0, 8).map(g => ({ id: genId(), name: String(g.name || 'Item'), type: String(g.type || 'misc'), desc: String(g.desc || ''), price: Math.max(1, parseInt(g.price) || 10), weight: (typeof g.weight === 'number' && g.weight > 0) ? g.weight : undefined, heal: (typeof g.heal === 'number' && g.heal > 0) ? g.heal : undefined, food: (typeof g.food === 'number' && g.food > 0) ? g.food : undefined, buff: (g.buff && g.buff.name) ? { name: String(g.buff.name), effect: String(g.buff.effect || ''), duration: (typeof g.buff.duration === 'number' && g.buff.duration > 0) ? g.buff.duration : null } : undefined }));
        // fold the fresh names into memory too
        vendor.stock.forEach(s => { const n = String(s.name || '').trim(); if (n && !vendor.seenGoods.some(x => x.toLowerCase() === n.toLowerCase())) vendor.seenGoods.push(n); });
        if (vendor.seenGoods.length > 60) vendor.seenGoods = vendor.seenGoods.slice(-60);
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
// ============================ SKILLS & RECIPES ============================
const MAX_SKILL_LEVEL = 5;
const SKILL_XP = 100;
const SKILL_BY_TYPE = {
    blacksmith: { en: 'Smithing', ru: 'Кузнечное дело' },
    cook: { en: 'Cooking', ru: 'Кулинария' },
    tailor: { en: 'Tailoring', ru: 'Портняжное дело' },
    apothecary: { en: 'Alchemy', ru: 'Алхимия' },
    alchemist: { en: 'Alchemy', ru: 'Алхимия' },
    jeweler: { en: 'Jewelcrafting', ru: 'Ювелирное дело' },
    merchant: { en: 'Bartering', ru: 'Торговля' }
};
function defaultSkillName(v) {
    const m = SKILL_BY_TYPE[v.type];
    if (m) return settings.language === 'ru' ? m.ru : m.en;
    if (v.customDomain && v.customDomain.trim()) return v.customDomain.trim().split(/[.,;\n]/)[0].slice(0, 30);
    return vendorRole(v);
}
function ensureSkill(v) {
    if (!v.skill || typeof v.skill !== 'object') v.skill = { name: defaultSkillName(v), level: 1, xp: 0 };
    if (typeof v.skill.level !== 'number') v.skill.level = 1;
    if (typeof v.skill.xp !== 'number') v.skill.xp = 0;
    if (!v.skill.name) v.skill.name = defaultSkillName(v);
}
function ensureRecipes(v) { if (!Array.isArray(v.recipes)) v.recipes = []; }
function addSkillXp(v, n) {
    ensureSkill(v);
    if (v.skill.level >= MAX_SKILL_LEVEL) { v.skill.xp = SKILL_XP; return; }
    v.skill.xp += Math.round(n || 0);
    while (v.skill.xp >= SKILL_XP && v.skill.level < MAX_SKILL_LEVEL) {
        v.skill.xp -= SKILL_XP; v.skill.level++;
        toastr.info(t('skill_up', { skill: v.skill.name, lvl: v.skill.level }));
    }
    if (v.skill.level >= MAX_SKILL_LEVEL) v.skill.xp = Math.min(v.skill.xp, SKILL_XP);
}
async function generateRecipes(v) {
    if (!settings.enabled) return;
    ensureSkill(v); ensureRecipes(v);
    toastr.info(t('recipes_gen_run'));
    try {
        const sys = `You are ${v.name}, a ${vendorRole(v)}. Your trade/domain: ${vendorDomain(v)}. Personality: ${vendorPersona(v) || 'ordinary'}.
Invent a short SKILL NAME for your craft (1-2 words, e.g. Cooking, Smithing, Alchemy — or, for an unusual trade, something that fits it), plus 3 to 4 CRAFTING RECIPES of DIFFERENT star levels (a mix — include at least one low 1★-2★ and at least one high 4★-5★, not all the same tier) that fit your trade and the setting below.
Each recipe has: "name" (the crafted item), "stars" (1-5; 5 = rare and powerful), "ingredients" (an array of 3 to 8 ingredient names — more and rarer for higher stars), "flavor" (one tempting sentence describing the FINISHED item as if on a menu or a shop label — do NOT list ingredients here), "result" (one short line on what the crafted item does: a buff, attack power, healing, etc.), "price" (coins to LEARN the recipe — a 1★ recipe about 15, a 5★ recipe 150+, scaled by stars), and "effect" — what the item mechanically DOES when eaten, drunk or worn: {"food":0-40 (satiety, only for edibles),"heal":0-60 (HP restored, for food/potions),"buff":{"name":"","effect":"","duration":turns}}. Include only the parts that fit the item (food/potion → food/heal and/or a buff; weapon/armour/clothing/accessory → a "buff" bonus granted WHILE WORN, duration omitted). 5★ items must be genuinely strong.
Match the WORLD, ERA and technology of the setting; no anachronisms. Write the skill name, recipe names, flavor, ingredients and results strictly in ${genLang()}.
Output strictly JSON: {"skill":"","recipes":[{"name":"","stars":1,"ingredients":["",""],"flavor":"","result":"","price":15,"effect":{"food":0,"heal":0,"buff":{"name":"","effect":"","duration":3}}}]}`;
        const res = await callAI(sys, settingContext());
        if (res.skill && !v.skill.userNamed) v.skill.name = String(res.skill).slice(0, 30);
        const recs = Array.isArray(res.recipes) ? res.recipes : [];
        const clampStars = x => Math.max(1, Math.min(5, parseInt(x) || 1));
        const parseEffect = (e) => {
            e = e || {}; const out = {};
            const food = parseInt(e.food); if (food > 0) out.food = Math.min(60, food);
            const heal = parseInt(e.heal); if (heal > 0) out.heal = Math.min(80, heal);
            if (e.buff && e.buff.name) out.buff = { name: String(e.buff.name).slice(0, 40), effect: String(e.buff.effect || '').slice(0, 90), duration: (parseInt(e.buff.duration) > 0 ? parseInt(e.buff.duration) : null) };
            return out;
        };
        const built = recs.slice(0, 8).map(r => {
            const stars = clampStars(r.stars);
            const ings = Array.isArray(r.ingredients) ? r.ingredients.map(x => String(x)).filter(Boolean).slice(0, 8) : [];
            const floor = [0, 15, 35, 60, 100, 150][stars];
            const price = Math.max(parseInt(r.price) || 0, floor + Math.floor(Math.random() * Math.round(floor * 0.6)));
            return { id: genId(), name: String(r.name || 'Recipe').slice(0, 60), stars, ingredients: ings, flavor: String(r.flavor || '').slice(0, 160), result: String(r.result || '').slice(0, 200), price, effect: parseEffect(r.effect), learned: false };
        });
        const have = new Set((v.recipes || []).map(r => String(r.name).toLowerCase()));
        v.recipes = (v.recipes || []).concat(built.filter(r => !have.has(r.name.toLowerCase())));
        await generateSharpenRecipes(v);
        saveState(); renderPanel(); toastr.success(t('recipes_gen_done'));
    } catch (e) { console.error('Recipe gen error:', e); toastr.error(t('recipes_gen_err')); }
}
// blacksmiths/tailors also get SHARPENING recipes — one per target grade (→2/→3/→4), rarer materials each step
async function generateSharpenRecipes(v) {
    const cat = v.type === 'blacksmith' ? 'weapon' : (v.type === 'tailor' ? 'armor' : null);
    if (!cat) return;
    try {
        const sys = `You are ${v.name}, a ${vendorRole(v)}. Design 3 SHARPENING / REFORGING procedures that upgrade ${cat === 'weapon' ? 'a weapon' : 'a piece of armour or clothing'} one quality tier at a time — to tier 2 (Honed), tier 3 (Fine) and tier 4 (Legendary). Each needs rarer materials than the one before.
For each: "targetGrade" (2, 3 or 4), "name" (short, e.g. "${cat === 'weapon' ? 'Whetstone Rite → Honed' : 'Fine Restitch → Honed'}"), and "ingredients" (2-4 material names; more and rarer for higher tiers). Fit the WORLD/ERA/setting. Write in ${genLang()}.
Output strictly JSON: {"procs":[{"targetGrade":2,"name":"","ingredients":["",""]}]}`;
        const res = await callAI(sys, settingContext());
        const procs = Array.isArray(res.procs) ? res.procs : [];
        v.recipes = (v.recipes || []).filter(r => r.kind !== 'sharpen'); // refresh
        procs.slice(0, 3).forEach(p => {
            const tg = Math.max(2, Math.min(4, parseInt(p.targetGrade) || 2));
            const ings = Array.isArray(p.ingredients) ? p.ingredients.map(String).filter(Boolean).slice(0, 4) : [];
            if (!ings.length) return;
            v.recipes.push({ id: genId(), kind: 'sharpen', category: cat, targetGrade: tg, name: String(p.name || ('→ ' + tg)).slice(0, 60), stars: tg, ingredients: ings, result: '', price: [0, 0, 40, 90, 160][tg], learned: false });
        });
        // additional REPAIR recipes — restore durability; fancier gear needs a fancier kit
        try {
            const sys2 = `You are ${v.name}, a ${vendorRole(v)}. Design 2 REPAIR kits that restore the durability of ${cat === 'weapon' ? 'a weapon' : 'armour or clothing'} — a basic field-repair and a thorough restoration (for finer, higher-grade pieces, needing rarer materials).
For each: "tier" (1 basic, 2 thorough), "name" (short, e.g. "${cat === 'weapon' ? 'Field Repair Kit' : 'Mending Kit'}"), and "ingredients" (2-4 material names). Fit the WORLD/ERA/setting. Write in ${genLang()}.
Output strictly JSON: {"kits":[{"tier":1,"name":"","ingredients":["",""]}]}`;
            const res2 = await callAI(sys2, settingContext());
            const kits = Array.isArray(res2.kits) ? res2.kits : [];
            v.recipes = (v.recipes || []).filter(r => r.kind !== 'repair'); // refresh
            kits.slice(0, 2).forEach(k => {
                const tier = Math.max(1, Math.min(2, parseInt(k.tier) || 1));
                const ings = Array.isArray(k.ingredients) ? k.ingredients.map(String).filter(Boolean).slice(0, 4) : [];
                if (!ings.length) return;
                v.recipes.push({ id: genId(), kind: 'repair', category: cat, tier, stars: tier + 1, name: String(k.name || 'Repair kit').slice(0, 60), ingredients: ings, result: '', price: tier === 2 ? 60 : 20, learned: false });
            });
        } catch (e2) { console.error('Repair recipe gen error:', e2); }
    } catch (e) { console.error('Sharpen recipe gen error:', e); }
}
function learnRecipe(v, id) {
    ensureRecipes(v); ensureSkill(v);
    const r = (v.recipes || []).find(x => x.id === id);
    if (!r || r.learned) return;
    const inv = invApi();
    if (inv && r.price > 0) { if (!inv.spendCoins(r.price)) { toastr.warning(t('not_enough')); return; } }
    r.learned = true;
    const gained = 10 + r.stars * 5;
    addSkillXp(v, gained);
    saveState(); renderPanel();
    toastr.success(t('r_learned', { name: r.name, xp: gained }));
}

// ==================== INGREDIENTS / CRAFT / TRAINING ====================
const CRAFT_ITEM_TYPE = { cook: 'food', apothecary: 'consumable', tailor: 'clothing', blacksmith: 'weapon', jeweler: 'misc', merchant: 'misc' };
function craftItemType(v) { return CRAFT_ITEM_TYPE[v.type] || 'misc'; }
// quality multiplier — accepts the cook-bar quality string OR the arc mini-game's 0..1 score
function craftQMul(q) { if (typeof q === 'number') return 0.6 + Math.max(0, Math.min(1, q)) * 0.8; return q === 'perfect' ? 1.4 : (q === 'bad' ? 0.6 : 1); }
// turn a recipe + craft quality into the inventory item to add.
// Edibles get satiety/heal and a buff that fires WHEN EATEN; gear carries a buff applied WHEN WORN.
function buildCraftedItem(v, r, q) {
    const type = craftItemType(v); const eff = r.effect || {}; const m = craftQMul(q);
    const mkBuff = b => (b && b.name) ? { name: b.name, effect: b.effect || '', kind: 'buff', duration: b.duration ? Math.max(1, Math.round(b.duration * m)) : null } : undefined;
    const item = { name: r.name, desc: r.result || '', type };
    if (type === 'food') {
        item.food = Math.max(5, Math.round((eff.food || (8 + r.stars * 5)) * Math.min(1.3, m)));
        if (eff.heal) item.heal = Math.round(eff.heal * m);
        if (eff.buff) item.buff = mkBuff(eff.buff);
    } else if (type === 'consumable') {
        if (eff.heal) item.heal = Math.round(eff.heal * m);
        if (eff.buff) item.buff = mkBuff(eff.buff);
        if (!item.heal && !item.buff) item.heal = 10 + r.stars * 4; // a potion should at least heal
    } else {
        // weapon / armour / clothing / accessory / misc — the buff applies once the piece is equipped
        if (eff.buff) item.buff = mkBuff(eff.buff);
    }
    return item;
}
// a FAILED craft still yields something: a wryly-named junk item whose DEBUFF triggers on eat/wear
// (equippable junk applies its debuff while worn and clears when taken off; bad food debuffs on eating).
async function addBotchedItem(v, baseName, typeHint) {
    const inv = invApi(); if (!inv) return null;
    try {
        const sys = `A crafting attempt by a ${vendorRole(v)} (deals in ${vendorDomain(v)}) FAILED${baseName ? ' while making "' + baseName + '"' : ''}.
Invent the botched result with a wry, Sims-like name (e.g. "Charred Mystery Rice", "Lumpy Grey Stew", "Crooked Bent Blade", "Itchy Lopsided Vest").
Give: "name", "type" (food, consumable, weapon, armor, clothing or misc — match what was being made), and a "debuff" {"name":"","effect":"","duration":turns} — a NEGATIVE effect that triggers when the item is eaten or worn.
Strictly ${genLang()}. Output JSON: {"name":"","type":"food","debuff":{"name":"","effect":"","duration":3}}`;
        const res = await callAI(sys, settingContext(), Math.min(1.1, (typeof settings.temperature === 'number' ? settings.temperature : 0.7) + 0.2));
        const types = ['food', 'consumable', 'weapon', 'armor', 'clothing', 'misc'];
        const type = types.includes(res.type) ? res.type : (types.includes(typeHint) ? typeHint : 'misc');
        const db = res.debuff || {};
        const worn = (type === 'weapon' || type === 'armor' || type === 'clothing');
        const item = { name: String(res.name || 'Botched item').slice(0, 60), desc: String(db.effect || '').slice(0, 120), type };
        if (db.name) item.buff = { name: String(db.name).slice(0, 40), effect: String(db.effect || '').slice(0, 90), kind: 'debuff', duration: worn ? null : Math.max(1, parseInt(db.duration) || 3) };
        if (type === 'food') item.food = 3; // bad food barely fills
        inv.add(item);
        return item.name;
    } catch (e) { console.error('botched item', e); inv.add({ name: baseName ? (baseName + ' (botched)') : 'Botched item', desc: '', type: typeHint || 'misc' }); return null; }
}
function skillHeaderHtml(v) {
    ensureSkill(v); const sk = v.skill;
    const pct = sk.level >= MAX_SKILL_LEVEL ? 100 : Math.round(sk.xp / SKILL_XP * 100);
    return `<div class="vnf-skill"><div class="vnf-skill-top"><span class="vnf-skill-name">${ic('wand')} ${escapeHtml(sk.name)}</span><span class="vnf-skill-lv">${escapeHtml(t('lvl_short'))} ${sk.level}/${MAX_SKILL_LEVEL}</span></div><div class="vnf-skill-bar"><div class="vnf-skill-fill" style="width:${pct}%"></div></div></div>`;
}

// every unique ingredient name the vendor's recipes call for (recipes are the source of truth)
function recipeIngredientNames(v) {
    const seen = new Map();
    (v.recipes || []).forEach(r => (r.ingredients || []).forEach(n => {
        const name = String(n || '').trim(); if (!name) return;
        const k = name.toLowerCase(); if (!seen.has(k)) seen.set(k, name);
    }));
    return [...seen.values()];
}
// look up the catalogued "where" (and real room) for an ingredient name
function ingredientInfo(v, name) {
    const k = String(name || '').toLowerCase();
    return (v.ingredients || []).find(g => String(g.name).toLowerCase() === k) || null;
}

function questApi() { return (window.RPG && window.RPG.quest && window.RPG.quest.available) ? window.RPG.quest : null; }
function forageChance(level) { return [22, 32, 44, 58, 72][Math.max(0, Math.min(4, (level || 1) - 1))]; }
// gear the bench can act on for a sharpen/repair recipe — both EQUIPPED pieces and matching items in the backpack.
// each entry: { key:'eq:<slot>'|'inv:<id>', label, grade }. Sharpen needs grade===target-1; repair needs it damaged.
function gearTargets(v, r) {
    const eq = eqApi(); const inv = invApi(); const out = [];
    const catOk = (type, slot) => r.category === 'weapon'
        ? (type === 'weapon' || slot === 'weapon')
        : (['armor', 'clothing'].includes(type) || (slot && slot !== 'weapon' && slot !== 'accessory'));
    if (eq) {
        (eq.list() || []).forEach(e => {
            if (!e.item) return; const it = e.item; if (!catOk(it.type, e.slot)) return;
            const g = it.grade || 1;
            if (r.kind === 'sharpen') { if (g === r.targetGrade - 1) out.push({ key: 'eq:' + e.slot, grade: g, label: `${e.label}: ${it.name} — ${it.gradeName || t('grade_' + g)} → ${t('grade_' + (g + 1))}` }); }
            else { if (it.broken || (it.dur < it.max)) out.push({ key: 'eq:' + e.slot, grade: g, label: `${e.label}: ${it.name} — ${it.broken ? t('repair_broken') : Math.round(it.dur / it.max * 100) + '%'}` }); }
        });
    }
    if (inv) {
        inv.list().forEach(it => {
            if (!['weapon', 'armor', 'clothing'].includes(it.type)) return; if (!catOk(it.type, null)) return;
            const g = it.grade || 1;
            if (r.kind === 'sharpen') { if (g === r.targetGrade - 1) out.push({ key: 'inv:' + it.id, grade: g, label: `🎒 ${it.name} — ${t('grade_' + g)} → ${t('grade_' + (g + 1))}` }); }
            else { const dur = (typeof it.dur === 'number') ? it.dur : (it.max || 100); const mx = it.max || 100; if (it.broken || dur < mx) out.push({ key: 'inv:' + it.id, grade: g, label: `🎒 ${it.name} — ${it.broken ? t('repair_broken') : Math.round(dur / mx * 100) + '%'}` }); }
        });
    }
    return out;
}

// ask the AI for a short desc + a "where" for each ingredient name; bind "where" to a real
// existing map room when the map engine is on (so nothing new is spawned).
async function assignIngredientInfo(v, names) {
    const map = mapApi();
    const rooms = (map && map.isEnabled()) ? map.listRooms().filter(r => !r.locked) : [];
    const roomList = rooms.map(r => r.location ? `${r.room} (${r.location})` : r.room);
    const sys = `You are ${v.name}, a ${vendorRole(v)} dealing in ${vendorDomain(v)}.
For EACH ingredient name below (used in your recipes), give a very short "desc" (3-6 words) and a "where" it is found, fitting the WORLD, ERA and setting (no anachronisms).
Ingredients: ${names.join(', ')}.
${roomList.length ? `For "where", CHOOSE the single most fitting place from THIS list of existing locations, copied verbatim — do NOT invent new places: ${roomList.join(' | ')}.` : `For "where", give a brief GENERIC place hint (e.g. "in a kitchen", "by the river"); do not invent specific room names.`}
Write strictly in ${genLang()}. Output JSON: {"ingredients":[{"name":"","desc":"","where":""}]}`;
    const res = await callAI(sys, settingContext());
    const got = {}; (Array.isArray(res.ingredients) ? res.ingredients : []).forEach(g => { if (g && g.name) got[String(g.name).toLowerCase()] = g; });
    return names.map(nm => {
        const g = got[nm.toLowerCase()] || {};
        const where = String(g.where || '').slice(0, 80);
        let roomKey = '';
        if (rooms.length && where) { const wl = where.toLowerCase(); const hit = rooms.find(r => wl.includes(r.room.toLowerCase()) || r.room.toLowerCase().includes(wl.split('(')[0].trim())); if (hit) roomKey = hit.room; }
        return { id: genId(), name: nm.slice(0, 50), desc: String(g.desc || '').slice(0, 120), where: where || roomKey, roomKey };
    });
}

// Take a hunt for the ingredients your LEARNED recipes still need. The loupe then turns them
// up while you search messages (see the engine). Buying from the shop stays as the quick path.
async function takeForageQuest(v) {
    if (!settings.enabled) return;
    ensureRecipes(v); ensureSkill(v);
    const q = questApi();
    if (!q) { toastr.warning(t('forage_need_quest')); return; }
    const inv = invApi();
    const learned = (v.recipes || []).filter(r => r.learned);
    if (!learned.length) { toastr.warning(t('forage_need_recipe')); return; }
    const need = new Map();
    learned.forEach(r => (r.ingredients || []).forEach(n => { const nm = String(n || '').trim(); if (nm) need.set(nm.toLowerCase(), nm); }));
    const have = new Set((inv ? inv.list() : []).map(i => String(i.name).toLowerCase()));
    const hunting = new Set((q.neededNames ? q.neededNames() : []).map(n => String(n).toLowerCase()));
    const missing = [...need.keys()].filter(k => !have.has(k) && !hunting.has(k)).map(k => need.get(k));
    if (!missing.length) { toastr.info(t('forage_none_missing')); return; }
    toastr.info(t('forage_run'));
    try {
        const info = await assignIngredientInfo(v, missing);
        // keep the BUY path alive too — stock a few (kept small on purpose, not a spam list)
        if (!Array.isArray(v.stock)) v.stock = [];
        info.slice(0, 3).forEach(ing => { if (!v.stock.some(sx => String(sx.name).toLowerCase() === ing.name.toLowerCase())) v.stock.push({ id: genId(), name: ing.name, type: 'material', desc: ing.desc, price: Math.max(2, Math.floor(Math.random() * 8) + 3) }); });
        v.ingredients = info; // remember where-hints on the vendor for the panel
        const res = q.addForage({ vendorName: v.name, skill: v.skill.name, chance: forageChance(v.skill.level), ingredients: info });
        saveState(); afterCraftChange();
        if (res) toastr.success(t('forage_started', { n: res.count })); else toastr.warning(t('craft_err'));
    } catch (e) { console.error('Forage quest error:', e); toastr.error(t('craft_err')); }
}

// ---- mini-game: tap when the marker is in the glowing zone; cb(quality 0..1) ----
function miniShell(inner) {
    $('#rpg-vnd-mini').remove();
    const el = $(`<div id="rpg-vnd-mini"><div class="vm-card">${inner}</div></div>`);
    $('body').append(el);
    return el;
}
// picks one of three mini-games at random; each calls done(quality 0..1) only on real completion (cancel does nothing)
function showMiniGame(skillLevel, cb) {
    skillLevel = Math.max(1, Math.min(MAX_SKILL_LEVEL, skillLevel || 1));
    let fired = false; const done = q => { if (fired) return; fired = true; cb(Math.max(0, Math.min(1, q))); };
    const games = [miniArc, miniReaction, miniSequence];
    games[Math.floor(Math.random() * games.length)](skillLevel, done);
}

// GAME 1 — timing: tap when the sweeping marker sits in the glowing arc.
function miniArc(skillLevel, done) {
    const hits = Math.max(1, 6 - skillLevel);
    const zoneDeg = 18 + skillLevel * 6;
    const step = (1.5 - skillLevel * 0.12) * 1.5;
    const R = 82, CX = 100, CY = 94;
    const rad = a => a * Math.PI / 180;
    const px = a => (CX + R * Math.cos(rad(a))).toFixed(2);
    const py = a => (CY - R * Math.sin(rad(a))).toFixed(2);
    const polyArc = (a1, a2, n) => { let d = ''; for (let i = 0; i <= (n || 44); i++) { const a = a1 + (a2 - a1) * i / (n || 44); d += (i ? ' L ' : 'M ') + px(a) + ' ' + py(a); } return d; };
    const zoneCenter = 34 + Math.random() * 112;
    const zoneA = Math.max(3, zoneCenter - zoneDeg / 2), zoneB = Math.min(177, zoneCenter + zoneDeg / 2);
    let ang = 178, dir = -1, doneN = 0, misses = 0, raf = null;
    const scores = [];
    const el = miniShell(`
        <div class="vm-title">${escapeHtml(t('mini_title'))}</div>
        <div class="vm-hint">${escapeHtml(t('mini_hint'))}</div>
        <svg class="vm-arc" viewBox="0 0 200 104" xmlns="http://www.w3.org/2000/svg">
            <path class="vm-track" d="${polyArc(178, 2)}"/>
            <path class="vm-zoneA" d="${polyArc(zoneB, zoneA)}"/>
            <circle class="vm-dot" r="7.5" cx="${px(178)}" cy="${py(178)}"/>
        </svg>
        <div class="vm-left">${escapeHtml(t('mini_left', { n: hits }))}</div>
        <div class="vm-acts"><button class="vm-btn vm-go vm-tap">${escapeHtml(t('mini_tap'))}</button>
        <button class="vm-btn vm-ghost vm-cancel">${escapeHtml(t('mini_cancel'))}</button></div>`);
    const dot = el.find('.vm-dot')[0];
    function frame() {
        ang += dir * step;
        if (ang <= 2) { ang = 2; dir = 1; } if (ang >= 178) { ang = 178; dir = -1; }
        if (dot) { dot.setAttribute('cx', px(ang)); dot.setAttribute('cy', py(ang)); }
        raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    const avg = () => scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    el.find('.vm-tap').on('click', () => {
        const prox = Math.max(0, 1 - Math.abs(ang - zoneCenter) / (zoneDeg / 2 + 4));
        const d = el.find('.vm-dot');
        if (prox < 0.15) { // a real miss: flash red, does NOT count as a hit
            d.addClass('miss'); setTimeout(() => d.removeClass('miss'), 150);
            misses++;
            if (misses + doneN >= hits * 3) { cancelAnimationFrame(raf); el.remove(); done(avg()); } // safety exit
            return;
        }
        scores.push(Math.max(0, Math.min(1, prox)));
        d.addClass('hit'); setTimeout(() => d.removeClass('hit'), 130);
        doneN++; el.find('.vm-left').text(t('mini_left', { n: Math.max(0, hits - doneN) }));
        if (doneN >= hits) { cancelAnimationFrame(raf); el.remove(); done(avg()); }
    });
    el.find('.vm-cancel').on('click', () => { cancelAnimationFrame(raf); el.remove(); });
}

// GAME 2 — reaction: wait for the signal, then tap as fast as you can. Tapping early scores 0.
function miniReaction(skillLevel, done) {
    const rounds = 3; let round = 0; const scores = []; let phase = 'idle', goAt = 0, timer = null;
    const el = miniShell(`
        <div class="vm-title">${escapeHtml(t('mini_r_title'))}</div>
        <div class="vm-hint vm-rhint">${escapeHtml(t('mini_r_wait'))}</div>
        <div class="vm-pad wait"></div>
        <div class="vm-left vm-round"></div>
        <div class="vm-acts"><button class="vm-btn vm-go vm-tap">${escapeHtml(t('mini_tap'))}</button>
        <button class="vm-btn vm-ghost vm-cancel">${escapeHtml(t('mini_cancel'))}</button></div>`);
    const pad = el.find('.vm-pad'), hint = el.find('.vm-rhint'), roundEl = el.find('.vm-round');
    function nextRound() {
        round++;
        if (round > rounds) { el.remove(); done(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0); return; }
        roundEl.text(t('mini_round', { n: round, m: rounds }));
        phase = 'wait'; pad.removeClass('go').addClass('wait'); hint.text(t('mini_r_wait'));
        timer = setTimeout(() => { phase = 'go'; goAt = performance.now(); pad.removeClass('wait').addClass('go'); hint.text(t('mini_r_go')); }, 800 + Math.random() * 1900);
    }
    function tap() {
        if (phase === 'wait') { clearTimeout(timer); hint.text(t('mini_r_early')); scores.push(0); phase = 'between'; setTimeout(nextRound, 550); }
        else if (phase === 'go') { const rt = performance.now() - goAt; scores.push(Math.max(0, Math.min(1, 1 - (rt - 200) / 700))); phase = 'between'; pad.removeClass('go'); nextRound(); }
    }
    el.find('.vm-tap').on('click', tap);
    pad.on('click', tap);
    el.find('.vm-cancel').on('click', () => { clearTimeout(timer); el.remove(); });
    nextRound();
}

// GAME 3 — memory: watch a sequence light up on four pads, then repeat it in order.
function miniSequence(skillLevel, done) {
    const N = 4, len = Math.max(3, Math.min(6, 2 + skillLevel));
    const seq = Array.from({ length: len }, () => Math.floor(Math.random() * N));
    let phase = 'watch', correct = 0; const input = [];
    const padsHtml = Array.from({ length: N }, (_, i) => `<button class="vm-spad" data-i="${i}"></button>`).join('');
    const el = miniShell(`
        <div class="vm-title">${escapeHtml(t('mini_s_title'))}</div>
        <div class="vm-hint vm-shint">${escapeHtml(t('mini_s_watch'))}</div>
        <div class="vm-pads">${padsHtml}</div>
        <div class="vm-left vm-sprog"></div>
        <div class="vm-acts"><button class="vm-btn vm-ghost vm-cancel">${escapeHtml(t('mini_cancel'))}</button></div>`);
    const pads = el.find('.vm-spad'), hint = el.find('.vm-shint'), prog = el.find('.vm-sprog');
    const flash = (i, cls) => { const p = $(pads[i]); p.addClass(cls || 'lit'); setTimeout(() => p.removeClass('lit hitg hitb'), 300); };
    let k = 0;
    function play() {
        if (k >= seq.length) { phase = 'input'; hint.text(t('mini_s_repeat')); prog.text('0/' + seq.length); return; }
        flash(seq[k], 'lit'); k++; setTimeout(play, 540);
    }
    setTimeout(play, 500);
    pads.on('click', function () {
        if (phase !== 'input') return;
        const i = +this.dataset.i, ok = i === seq[input.length];
        if (ok) correct++;
        flash(i, ok ? 'hitg' : 'hitb'); input.push(i); prog.text(input.length + '/' + seq.length);
        if (input.length >= seq.length) { phase = 'done'; hint.text(correct === seq.length ? t('mini_s_good') : t('mini_s_bad')); setTimeout(() => { el.remove(); done(correct / seq.length); }, 500); }
    });
    el.find('.vm-cancel').on('click', () => el.remove());
}

function craftRecipe(v, id) {
    ensureRecipes(v); ensureSkill(v);
    const inv = invApi(); if (!inv) { toastr.warning(t('no_inv_shop')); return; }
    const r = (v.recipes || []).find(x => x.id === id); if (!r) return;
    const bag = inv.list();
    const byName = {}; bag.forEach(it => { const k = String(it.name).toLowerCase(); (byName[k] = byName[k] || []).push(it.id); });
    const need = {}; (r.ingredients || []).forEach(n => { const k = String(n).toLowerCase(); need[k] = (need[k] || 0) + 1; });
    const missing = [], useIds = [];
    for (const k in need) { const have = (byName[k] || []).length; if (have < need[k]) missing.push(k); else useIds.push(...byName[k].slice(0, need[k])); }
    if (missing.length) { toastr.warning(t('craft_need', { list: missing.join(', ') })); return; }
    showMiniGame(v.skill.level, (q) => {
        useIds.forEach(x => inv.remove(x));
        if (q < 0.34) { // botched attempt → junk item with a debuff
            addSkillXp(v, 3);
            addBotchedItem(v, r.name, craftItemType(v)).then(n => { saveState(); afterCraftChange(); toastr.warning(t('craft_botched', { name: n || r.name })); });
            return;
        }
        inv.add(buildCraftedItem(v, r, q)); // effect fires when eaten / worn — not now
        addSkillXp(v, 8 + r.stars * 4 + Math.round(q * 10));
        saveState(); afterCraftChange(); toastr.success(t('craft_done', { name: r.name }));
    });
}

// freestyle ALWAYS produces an item; the AI also judges whether the mix fits this vendor's trade
// (metal in a kitchen won't fit → fails). Success → good buff item; failure → wry junk with a debuff.
async function freestyleResolve(v, items, q, onDone) {
    const inv = invApi();
    const base = [10, 30, 50, 70, 90][Math.max(0, Math.min(4, v.skill.level - 1))];
    const qb = (typeof q === 'number') ? Math.round(q * 8) : (q === 'perfect' ? 8 : q === 'bad' ? -12 : 0);
    const rngSuccess = Math.random() * 100 < Math.max(3, Math.min(90, base + qb));
    toastr.info(t('craft_run'));
    try {
        const names = items.map(i => i.name).join(', ');
        const sys = `A ${vendorRole(v)} (deals in ${vendorDomain(v)}) mixed these materials with NO recipe: ${names}.
First judge "fits": do these materials plausibly belong to a ${vendorRole(v)}'s craft? (e.g. metal scraps or copper do NOT fit a kitchen; herbs and flour do.) If they clearly do not fit, the craft FAILS no matter what.
Treating this as a ${rngSuccess ? 'promising' : 'shaky'} attempt:
- If it SUCCEEDS: a good "name", a "type" (food, consumable, or an equippable weapon/armor/clothing if this trade makes gear), and a POSITIVE "effect" {"name":"","effect":"","duration":turns} that triggers when the item is used or worn.
- If it FAILS: a wry Sims-like botched "name" (e.g. "Charred Mystery Rice", "Lumpy Grey Stew"), a fitting "type", and a NEGATIVE "effect" (a debuff) that triggers when the item is eaten or worn.
Strictly ${genLang()}. Output JSON: {"fits":true,"name":"","type":"consumable","effect":{"name":"","effect":"","duration":3}}`;
        const res = await callAI(sys, settingContext(), Math.min(1.05, (typeof settings.temperature === 'number' ? settings.temperature : 0.7) + 0.15));
        if (inv) items.forEach(i => inv.remove(i.id));
        const fits = res.fits !== false;
        const success = rngSuccess && fits;
        addSkillXp(v, success ? (6 + (typeof q === 'number' ? Math.round(q * 8) : 4)) : 3);
        const types = ['food', 'consumable', 'weapon', 'armor', 'clothing', 'misc'];
        const type = types.includes(res.type) ? res.type : (success ? 'consumable' : 'misc');
        const worn = (type === 'weapon' || type === 'armor' || type === 'clothing');
        const eff = res.effect || {};
        const item = { name: String(res.name || (success ? 'Concoction' : 'Botched mix')).slice(0, 60), desc: String(eff.effect || '').slice(0, 120), type };
        if (eff.name) item.buff = { name: String(eff.name).slice(0, 40), effect: String(eff.effect || '').slice(0, 90), kind: success ? 'buff' : 'debuff', duration: worn ? null : Math.max(1, parseInt(eff.duration) || 3) };
        if (type === 'food') item.food = success ? (8 + Math.floor(Math.random() * 10)) : 3;
        if (inv) inv.add(item);
        const rn = res.name || eff.name || '?';
        if (success) toastr.success(t('free_success', { name: rn })); else toastr.warning(t('free_fail', { name: rn }));
        if (onDone) onDone(success, rn);
        return { success, name: rn };
    } catch (e) { console.error('Freestyle craft error:', e); toastr.error(t('craft_err')); return { success: false, name: '\u2717' }; }
}
function freestyleCraft(v, ids) {
    ensureSkill(v);
    const inv = invApi(); if (!inv) { toastr.warning(t('no_inv_shop')); return; }
    const bag = inv.list();
    const items = (ids || []).map(id => bag.find(b => b.id === id)).filter(Boolean).slice(0, 4);
    if (items.length < 2) { toastr.warning(t('free_pick')); return; }
    showMiniGame(v.skill.level, (q) => freestyleResolve(v, items, q, () => { benchSlots = []; afterCraftChange(); }));
}

// ---- Training (physical trainers) ----
function trainCost(v) { ensureSkill(v); return 10 + v.skill.level * 10; }
// on levelling up under a trainer, grant a PERMANENT reward: a sticky buff (never fades) + a small max-HP bump
function grantTrainingReward(v, beforeLevel) {
    const vit = vitApi(); if (!vit || v.skill.level <= beforeLevel) return;
    vit.addBuff({ name: t('train_perk', { skill: v.skill.name }), effect: t('train_perk_eff', { skill: v.skill.name, lvl: v.skill.level }), kind: 'buff', duration: null, tag: 'train:' + v.id + ':' + v.skill.level });
    const hp = (typeof vit.getHp === 'function') ? vit.getHp() : null;
    if (hp && typeof vit.setHp === 'function') { const bump = 4 + v.skill.level * 2; vit.setHp(hp.hp + bump, hp.max + bump); }
    toastr.success(t('train_perk_got', { skill: v.skill.name }));
}
// FREE, story-driven: log a sparring win from the RP. Raises the level WITHOUT paying (no special reward).
function sparWin(v) { ensureSkill(v); addSkillXp(v, 15); saveState(); renderPanel(); afterCraftChange(); toastr.success(t('train_story', { xp: 15, skill: v.skill.name })); }

// ---- Trainer quest program (practice drills + field tasks graded from the story) ----
function parseQuestReward(rw) {
    rw = rw || {};
    const out = { kind: 'xp', xp: Math.max(5, Math.min(60, parseInt(rw.xp) || 15)) };
    if (rw.kind === 'buff' && rw.buff && rw.buff.name) {
        const d = parseInt(rw.buff.duration);
        out.kind = 'buff'; out.perm = !(d > 0);
        out.buff = { name: String(rw.buff.name).slice(0, 40), effect: String(rw.buff.effect || '').slice(0, 90), duration: d > 0 ? d : null };
    } else if (rw.kind === 'item' && rw.item && rw.item.name) {
        const types = ['weapon', 'armor', 'clothing', 'consumable', 'food', 'misc']; const it = rw.item;
        out.kind = 'item';
        out.item = { name: String(it.name).slice(0, 60), desc: String(it.desc || '').slice(0, 120), type: types.includes(it.type) ? it.type : 'misc', food: Math.max(0, Math.min(40, parseInt(it.food) || 0)), heal: Math.max(0, Math.min(60, parseInt(it.heal) || 0)) };
        if (it.buff && it.buff.name) out.item.buff = { name: String(it.buff.name).slice(0, 40), effect: String(it.buff.effect || '').slice(0, 90), duration: parseInt(it.buff.duration) > 0 ? parseInt(it.buff.duration) : 0 };
    }
    return out;
}
// turn a reward's item spec into an inventory payload (equippable gear → buff-on-wear; edible → satiety/heal/buff-on-eat)
function buildTrainingItem(pit) {
    const it = { name: pit.name, desc: pit.desc || '', type: pit.type };
    if (pit.buff && pit.buff.name) it.buff = { name: pit.buff.name, effect: pit.buff.effect || '', kind: 'buff', duration: (pit.type === 'food' || pit.type === 'consumable') ? Math.max(1, pit.buff.duration || 3) : null };
    if (pit.type === 'food') it.food = Math.max(5, pit.food || 12);
    if ((pit.type === 'food' || pit.type === 'consumable') && pit.heal) it.heal = pit.heal;
    return it;
}
function questRewardLabel(q) {
    const rw = q.reward || {};
    if (rw.kind === 'buff') return `✨ ${escapeHtml((rw.buff && rw.buff.name) || t('q_rew_buff'))}${rw.perm ? ' ★' : ''}`;
    if (rw.kind === 'item') return `🎁 ${escapeHtml((rw.item && rw.item.name) || t('q_rew_item'))}`;
    return `🏅 +${rw.xp || 10} XP`;
}
function questRewardPlain(q) {
    const rw = q.reward || {};
    if (rw.kind === 'buff') return (rw.buff && rw.buff.name) || t('q_rew_buff');
    if (rw.kind === 'item') return (rw.item && rw.item.name) || t('q_rew_item');
    return '+' + (rw.xp || 10) + ' XP';
}
function grantQuestReward(v, q, quality) {
    ensureSkill(v);
    const rw = q.reward || {}; const vit = vitApi(); const inv = invApi();
    const xp = Math.max(1, Math.round(Math.max(1, rw.xp || 10) + Math.round((typeof quality === 'number' ? quality : 0.5) * 8)));
    addTrainerXp(v, xp); // fills the bar; leveling is gated by the two main quests
    const notes = [`+${xp} XP`];
    if (rw.kind === 'buff' && rw.buff && rw.buff.name && vit) {
        vit.addBuff({ name: rw.buff.name, effect: rw.buff.effect || '', kind: 'buff', duration: rw.perm ? null : Math.max(1, parseInt(rw.buff.duration) || 3), tag: rw.perm ? ('train:' + v.id + ':' + q.id) : undefined });
        notes.push((rw.perm ? '★ ' : '') + rw.buff.name);
    } else if (rw.kind === 'item' && rw.item && rw.item.name && inv) {
        const it = buildTrainingItem(rw.item); inv.add(it); notes.push('🎁 ' + it.name);
    }
    if (settings.autoChatNote) insertChatNote(t('cn_train_done', { user: getContext().name1 || 'I', vendor: v.name, skill: v.skill.name, title: q.title, desc: q.desc || '', reward: questRewardPlain(q) }));
    saveState(); renderPanel();
    toastr.success(t('q_reward_got', { list: notes.join(' · ') }));
    if (q.main) advanceTrainerLevel(v); // finishing both mains of the level opens the next
}
// decline / fail a MAIN lesson → it's replaced by a fresh one at the same level, and you take a debuff
async function failMain(v, q) {
    ensureTraining(v);
    const lvl = q.minLevel || 1;
    v.training = v.training.filter(x => x.id !== q.id);
    const vit = vitApi();
    if (vit) vit.addBuff({ name: t('train_fail_debuff', { skill: v.skill.name }), effect: t('train_fail_debuff_eff'), kind: 'debuff', duration: 4 });
    saveState(); afterCraftChange(); toastr.warning(t('q_failed_note'));
    try {
        const sys = `You are ${v.name}, a ${vendorRole(v)} teaching "${v.skill.name}". Invent ONE replacement MAIN lesson for a level-${lvl} student (the previous one was abandoned). Give "title", "desc" (one sentence), "type" ("practice" or "field"), and a "reward" {"kind":"xp|buff|item","xp":10-40,...}. Fit the setting; write in ${genLang()}.
Output strictly JSON: {"title":"","desc":"","type":"field","reward":{"kind":"xp","xp":15}}`;
        const res = await callAI(sys, settingContext(), Math.min(1.05, (typeof settings.temperature === 'number' ? settings.temperature : 0.7) + 0.15));
        v.training.push({ id: genId(), title: String(res.title || 'Lesson').slice(0, 60), desc: String(res.desc || '').slice(0, 200), type: res.type === 'field' ? 'field' : 'practice', minLevel: lvl, grad: false, main: true, reward: parseQuestReward(res.reward), done: false });
    } catch (e) { v.training.push({ id: genId(), title: t('q_practice'), desc: '', type: 'practice', minLevel: lvl, grad: false, main: true, reward: { kind: 'xp', xp: 15 }, done: false }); }
    v.training.sort((a, b) => (a.minLevel - b.minLevel) || (a.grad ? 1 : -1));
    saveState(); afterCraftChange();
}
// ----- card renderers -----
function trainCardHtml(v, q) {
    const locked = v.skill.level < (q.minLevel || 1);
    let act;
    if (q.done) act = `<span class="tq-state done">✓ ${escapeHtml(t('q_done'))}</span>`;
    else if (locked) act = `<span class="tq-state lock">🔒 ${escapeHtml(t('q_lockedlv', { lv: q.minLevel || 1 }))}</span>`;
    else {
        const fail = `<button class="vnf-btn b-red tq-fail" data-q="${q.id}">${ic('x')}${escapeHtml(t('q_decline'))}</button>`;
        if (q.type === 'field') {
            act = (q.active
                ? `<button class="vnf-btn b-navy tq-done-btn" data-q="${q.id}">${ic('check')}${escapeHtml(t('q_idid'))}</button><button class="vnf-btn b-paper tq-check" data-q="${q.id}">${ic('wand')}${escapeHtml(t('q_check'))}</button>`
                : `<button class="vnf-btn b-violet tq-take" data-q="${q.id}">${ic('play')}${escapeHtml(t('q_take'))}</button>`) + fail;
        } else {
            act = `<button class="vnf-btn b-violet tq-do" data-q="${q.id}">${ic('play')}${escapeHtml(t('q_practice'))}</button>` + fail;
        }
    }
    return `<div class="vnf-quest ${q.done ? 'qdone' : ''} ${q.active ? 'active' : ''} ${q.grad ? 'qgrad' : ''} ${q.drill ? 'drill' : ''}">
        <div class="qn">${q.grad ? '🎓 ' : ''}${escapeHtml(q.title)}</div>
        ${q.desc ? `<div class="qd">${escapeHtml(q.desc)}</div>` : ''}
        <div class="meta"><b>${escapeHtml(t('q_kind'))}</b> ${escapeHtml(q.type === 'field' ? t('q_kind_field') : t('q_kind_practice'))} · <b>${escapeHtml(t('lvl_short'))}</b> ${q.minLevel || 1}<br><b>${escapeHtml(t('q_reward'))}</b> ${questRewardLabel(q)}</div>
        ${q.active ? `<div class="tq-activehint">${ic('leave')} ${escapeHtml(t('q_active_hint'))}</div>` : ''}
        <div class="acts">${act}</div>
    </div>`;
}
function drillCardHtml(v, d) { return trainCardHtml(v, d); }
function doPractice(v, q) {
    ensureSkill(v);
    if (v.skill.level < (q.minLevel || 1)) { toastr.warning(t('q_locked')); return; }
    showMiniGame(v.skill.level, (quality) => {
        if (quality < 0.34) { toastr.warning(t('q_sloppy')); return; } // botched — no reward, try again
        grantQuestReward(v, q, quality); q.done = true; saveState(); afterCraftChange();
    });
}
// take a field lesson: mark it active, remember WHERE in the chat you started, and let the trainer know
function takeField(v, q) {
    ensureSkill(v);
    if (v.skill.level < (q.minLevel || 1)) { toastr.warning(t('q_locked')); return; }
    q.active = true;
    try { q.startIdx = (getContext().chat || []).length; } catch (e) { q.startIdx = 0; }
    saveState(); afterCraftChange();
    if (settings.autoChatNote) insertChatNote(t('cn_train_take', { user: getContext().name1 || 'I', vendor: v.name, skill: v.skill.name, title: q.title, desc: q.desc || '' }));
    toastr.success(t('q_taken'));
}
// finish on your word (trust) — only if AI-check isn't required
function selfComplete(v, q) {
    if (settings.requireAiCheck) { toastr.info(t('q_need_ai')); return; }
    grantQuestReward(v, q, 0.6); q.done = true; q.active = false; saveState(); afterCraftChange();
}
async function checkField(v, q) {
    ensureSkill(v);
    if (v.skill.level < (q.minLevel || 1)) { toastr.warning(t('q_locked')); return; }
    const ctx = getContext();
    const chat = ctx.chat || [];
    // review everything from where the lesson was taken (capped so we never send a thousand messages)
    const from = (typeof q.startIdx === 'number' && q.startIdx >= 0) ? Math.max(q.startIdx, chat.length - 40) : Math.max(0, chat.length - 12);
    const msgs = chat.slice(from).map(m => (m.is_user ? '[You] ' : '[Scene] ') + String(m.mes || '').slice(0, 400)).join('\n');
    if (!msgs.trim()) { toastr.warning(t('q_no_scene')); return; }
    toastr.info(t('q_checking'));
    try {
        const sys = `A trainer set this task: "${q.title} — ${q.desc}". Read the roleplay below (everything since the student took on the task) and decide whether the student "${ctx.name1 || 'the player'}" ACTUALLY carried it out in the story. Be fair, but require real evidence in the text (not just intent). Reply in ${genLang()}.
Output JSON: {"done":true,"why":"one short sentence"}`;
        const res = await callAI(sys, msgs);
        if (res && res.done) { grantQuestReward(v, q, 0.7); q.done = true; q.active = false; saveState(); afterCraftChange(); toastr.success(t('q_pass', { why: String(res.why || '') })); }
        else toastr.warning(t('q_notyet', { why: String((res && res.why) || '') }));
    } catch (e) { console.error('Field check error:', e); toastr.error(t('craft_err')); }
}
function ensureTraining(v) { if (!Array.isArray(v.training)) v.training = []; if (!Array.isArray(v.drills)) v.drills = []; }
// trainer XP fills the bar but never auto-levels — leveling is gated by the two MAIN quests
function addTrainerXp(v, n) { ensureSkill(v); if (v.skill.level >= MAX_SKILL_LEVEL) { v.skill.xp = SKILL_XP; return; } v.skill.xp = Math.min(SKILL_XP - 1, v.skill.xp + Math.round(n || 0)); }
// how many main quests at the current level are done
function mainsAt(v, lvl) { return (v.training || []).filter(q => q.main && (q.minLevel || 1) === lvl); }
function levelReady(v) { const m = mainsAt(v, v.skill.level); return m.length > 0 && m.every(q => q.done); }
// completing both main quests of the current level unlocks the next one
function advanceTrainerLevel(v) {
    if (v.skill.level >= MAX_SKILL_LEVEL || !levelReady(v)) return;
    const before = v.skill.level;
    v.skill.level++; v.skill.xp = 0;
    grantTrainingReward(v, before); // permanent perk + max-HP bump on level-up
    v.drills = []; // old drills close; fresh ones for the new level
    toastr.success(t('train_levelup', { skill: v.skill.name, lvl: v.skill.level }));
    saveState();
    generateDrills(v); // auto-roll drills for the new level
}

async function generateTraining(v) {
    if (!settings.enabled) return;
    ensureSkill(v); ensureTraining(v);
    toastr.info(t('train_gen_run'));
    try {
        const sys = `You are ${v.name}, a ${vendorRole(v)} who TEACHES the discipline "${v.skill.name}" (a physical or performance skill — e.g. swordsmanship, battle magic, an instrument, 19th-century marksmanship, dance). Design a TRAINING PROGRAM as MAIN milestones: EXACTLY 2 main lessons for EACH skill level 1, 2, 3, 4 and 5 (10 total), PLUS one special GRADUATION challenge for a master at level 5.
Each lesson has: "title" (short), "desc" (ONE sentence on what the student must DO), "type" ("practice" = a drill repped on the spot, or "field" = something done out in the story/roleplay such as winning a spar, performing at a recital, hitting targets at a range), "minLevel" (1..5), "grad" (true only for the graduation), and a "reward":
- "kind": "xp", "buff" or "item"; always include "xp": 10..40.
- if "buff": "buff":{"name":"","effect":"","duration": turns, or 0 for a PERMANENT milestone perk}.
- if "item": "item":{"name":"","desc":"","type": one of weapon/armor/clothing/consumable/food/misc, "food":0-30, "heal":0-40, "buff":{"name":"","effect":"","duration":0}} — a reward that fits the teacher (e.g. a duelling pistol from a marksman, sheet music or a fine baton from a pianist, an enchanted focus from a battle mage).
Vary the reward kinds. Higher levels give stronger rewards. The GRADUATION reward is unique and powerful — a signature permanent buff or a named item. Fit the WORLD, ERA and setting; no anachronisms. Write everything in ${genLang()}.
Output strictly JSON: {"quests":[{"title":"","desc":"","type":"practice","minLevel":1,"grad":false,"reward":{"kind":"xp","xp":15}}]}`;
        const res = await callAI(sys, settingContext());
        const qs = Array.isArray(res.quests) ? res.quests : [];
        v.training = qs.slice(0, 12).map(q => ({ id: genId(), title: String(q.title || 'Lesson').slice(0, 60), desc: String(q.desc || '').slice(0, 200), type: q.type === 'field' ? 'field' : 'practice', minLevel: Math.max(1, Math.min(5, parseInt(q.minLevel) || 1)), grad: !!q.grad, main: true, reward: parseQuestReward(q.reward), done: false }));
        if (v.training.length && !v.training.some(q => q.grad)) { const g = v.training.slice().sort((a, b) => b.minLevel - a.minLevel)[0]; if (g) { g.grad = true; g.minLevel = 5; } }
        v.training.sort((a, b) => (a.minLevel - b.minLevel) || (a.grad ? 1 : -1));
        v.drills = [];
        saveState(); afterCraftChange(); toastr.success(t('train_gen_done'));
        generateDrills(v);
    } catch (e) { console.error('Training gen error:', e); toastr.error(t('craft_err')); }
}
// small, regeneratable themed drills for the CURRENT level (XP only)
async function generateDrills(v) {
    if (!settings.enabled) return;
    ensureSkill(v); ensureTraining(v);
    toastr.info(t('drill_gen_run'));
    try {
        const sys = `You are ${v.name}, a ${vendorRole(v)} teaching "${v.skill.name}". Invent 3 SMALL extra exercises for a level-${v.skill.level} student — short and thematic to your discipline (e.g. a pianist: "Play the étude at the café"; a ninja: "Slip through the crowd unseen and tag the mark"; a boxer: "Spar three rounds without dropping your guard").
Each has: "title" (short), "desc" (ONE sentence on what to DO), and "type" — mostly "field" (something ACTED OUT in the story/roleplay), occasionally "practice" (a quick on-the-spot drill). Prefer "field". These give only XP.
Fit the WORLD/ERA/setting; write in ${genLang()}.
Output strictly JSON: {"drills":[{"title":"","desc":"","type":"field"}]}`;
        const res = await callAI(sys, settingContext(), Math.min(1.1, (typeof settings.temperature === 'number' ? settings.temperature : 0.7) + 0.15));
        const ds = Array.isArray(res.drills) ? res.drills : [];
        v.drills = ds.slice(0, 3).map(d => ({ id: genId(), title: String(d.title || 'Drill').slice(0, 60), desc: String(d.desc || '').slice(0, 160), type: d.type === 'practice' ? 'practice' : 'field', minLevel: v.skill.level, drill: true, reward: { kind: 'xp', xp: 10 + Math.floor(Math.random() * 8) }, done: false }));
        saveState(); afterCraftChange(); toastr.success(t('drill_gen_done'));
    } catch (e) { console.error('Drill gen error:', e); toastr.error(t('craft_err')); }
}
// find a lesson OR a drill by id (same shape, same buttons)
function findTrainQuest(v, id) { return (v.training || []).find(x => x.id === id) || (v.drills || []).find(x => x.id === id) || null; }
// declining: a main lesson stings (debuff + replacement); a drill just drops away
function declineQuest(v, q) { if (q.drill) { v.drills = (v.drills || []).filter(x => x.id !== q.id); saveState(); afterCraftChange(); toastr.info(t('drill_dropped')); } else failMain(v, q); }

// ===== Craftbench: triptych (recipes | mystic circle | ingredients) with cooking minigame =====
const CB_ICON = {
    doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    stamp:'<path d="M9 3h6v5l2 3H7l2-3zM5 15h14v3H5zM5 21h14"/>',
    ink:'<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
    film:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16M4 9h5M4 15h5"/>',
    flask:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
    bottle:'<path d="M9 2h6M10 2v3l-2 3v13h8V8l-2-3V2M8 13h8"/>',
    cup:'<path d="M5 8h14l-1.5 12h-11zM5 8l-1-4h16l-1 4"/>',
    cloth:'<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>',
    thread:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16M6 8h12M6 16h12"/>',
    patch:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16" stroke-dasharray="2 2"/>',
    spark:'<path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    flame:'<path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1 .6-1.4 1-2 1.6 1.8 3 3.6 3 6a6 6 0 0 1-12 0c0-4 4-5 6-11z"/>',
    book:'<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/>',
    box:'<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'
};
function cbIcon(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (CB_ICON[k] || CB_ICON.box) + '</svg>'; }
function ingIconKey(name) {
    const t = String(name || '').toLowerCase(); const has = (...a) => a.some(w => t.includes(w));
    if (has('заплат', 'патч', 'patch')) return 'patch';
    if (has('печат', 'штамп', 'штемпел', 'stamp')) return 'stamp';
    if (has('чернил', 'краск', 'тушь', 'ink')) return 'ink';
    if (has('плёнк', 'плен', 'целлофан', 'film')) return 'film';
    if (has('сироп', 'сахар', 'мёд', 'мед', 'syrup', 'honey')) return 'bottle';
    if (has('бутыл', 'фляг', 'склянк', 'bottle', 'vial')) return 'bottle';
    if (has('газир', 'напит', 'сок', 'вод', 'soda', 'juice', 'water')) return 'cup';
    if (has('ткан', 'лоскут', 'кожа', 'ремень', 'cloth', 'leather', 'fabric')) return 'cloth';
    if (has('нит', 'пряж', 'верёвк', 'верев', 'thread', 'rope', 'string')) return 'thread';
    if (has('кофе', 'энерг', 'эликсир', 'зель', 'настой', 'caffe', 'potion', 'elixir', 'brew')) return 'flask';
    if (has('книг', 'свит', 'скрол', 'рецепт', 'book', 'scroll')) return 'book';
    if (has('бумаг', 'бланк', 'лист', 'справк', 'транскрипт', 'эссе', 'заметк', 'paper', 'note', 'sheet', 'document')) return 'doc';
    return 'box';
}
function recipeIconKey(r) { const k = ingIconKey((r.name || '') + ' ' + (r.result || '')); return k === 'box' ? 'flask' : k; }

let benchSel = null, benchSlotsFor = null, benchSlots = [], benchCrafted = '', benchCraftedQ = '', benchBusy = false, sharpenTarget = '';
let cbCook = null, cbKeyH = null, cbVendorId = null;
function cbRenderAll(v) {
    const safe = (fn, name, boxId) => { try { fn(); } catch (e) { console.error('[Vendors] ' + name + ' render failed:', e); const b = cbEl(boxId); if (b && !b.innerHTML) b.innerHTML = `<div class="cb-empty">${escapeHtml(t('craft_err'))}</div>`; } };
    safe(() => cbRenderRecipes(v), 'recipes', 'vc-rlist');
    safe(() => cbRenderBench(v), 'bench', 'vc-bench');
    safe(() => cbRenderInv(v), 'ingredients', 'vc-igrid');
}
function afterCraftChange() {
    const v = state.vendors.find(x => x.id === cbVendorId);
    if (v && document.getElementById('vc-bench')) cbRenderAll(v);
    else renderPanel();
}

function cbCurRecipe(v) { return benchSel === 'free' ? null : (v.recipes || []).find(r => r.id === benchSel && r.learned); }
function cbBuildSlots(v) {
    const r = cbCurRecipe(v);
    if (benchSel === 'free') benchSlots = [0, 1, 2, 3].map(() => ({ need: null, itemId: null }));
    else if (r) benchSlots = (r.ingredients || []).map(n => ({ need: n, itemId: null }));
    else benchSlots = [];
    benchSlotsFor = benchSel; benchCrafted = ''; benchCraftedQ = '';
}
function cbReady() { if (!benchSlots.length) return false; return benchSel === 'free' ? benchSlots.filter(s => s.itemId).length >= 2 : benchSlots.every(s => s.itemId); }
function cbBag(v) { const inv = invApi(); return inv ? inv.list() : []; }

function mountCraft(body, v) {
    try {
        cbVendorId = v.id; ensureSkill(v); ensureIngredients(v); ensureRecipes(v);
        const learned = (v.recipes || []).filter(r => r.learned);
        if (benchSel !== 'free' && !learned.some(r => r.id === benchSel)) benchSel = learned.length ? learned[0].id : 'free';
        if (benchSlotsFor !== benchSel) cbBuildSlots(v);
    } catch (e) { console.error('[Vendors] craft setup failed:', e); benchSel = 'free'; benchSlots = []; }
    cbRenderAll(v);
    body.find('.vc-forage').off('click').on('click', () => takeForageQuest(v));
}
function cbEl(id) { return document.getElementById(id); }

function cbRenderRecipes(v) {
    const box = cbEl('vc-rlist'); if (!box) return;
    const hh = cbEl('vc-rech'); if (hh) hh.innerHTML = cbIcon('book') + escapeHtml(t('recipes_side'));
    const recs = v.recipes || [];
    // how many of each material the player is carrying — so recipe ingredients show green (have) / red (missing)
    const inv = invApi(); const bagCount = {};
    if (inv) inv.list().forEach(i => { const k = String(i.name).toLowerCase(); bagCount[k] = (bagCount[k] || 0) + 1; });
    const chip = (n, known) => {
        const has = (bagCount[String(n).toLowerCase()] || 0) > 0;
        const cls = known ? (has ? 'has' : 'miss') : '';
        return `<span class="ningr ${cls}">${cbIcon(ingIconKey(n))}<b>${escapeHtml(n)}</b></span>`;
    };
    let html = `<button class="recipe ${benchSel === 'free' ? 'sel' : ''}" data-free="1"><div class="rn"><span class="mark">🧪 ${escapeHtml(t('free_section'))}</span></div><div class="rdesc">${escapeHtml(t('free_hint'))}</div></button>`;
    recs.forEach(r => {
        if (r.learned) {
            const needs2 = (r.ingredients || []).slice(0, 8).map(n => chip(n, true)).join('');
            const isSp = r.kind === 'sharpen', isRp = r.kind === 'repair';
            const mk = isSp ? '⚒ ' : (isRp ? '🛠 ' : '');
            const tag = isSp ? escapeHtml(t('sharpen_tag', { grade: t('grade_' + r.targetGrade) })) : (isRp ? escapeHtml(t('repair_tag')) : '★'.repeat(r.stars));
            html += `<button class="recipe ${benchSel === r.id ? 'sel' : ''}" data-r="${r.id}"><div class="rn"><span class="mark">${mk}${escapeHtml(r.name)}</span></div><span class="rtag">${tag}</span>${r.result ? `<div class="rdesc">${escapeHtml(r.result)}</div>` : ''}<div class="rneed-h">${escapeHtml(t('recipe_ing'))}</div><div class="needs2">${needs2}</div></button>`;
        } else {
            // unlearned: ingredients stay hidden until the recipe is learned
            html += `<div class="recipe locked"><div class="rn">🔒 ${escapeHtml(r.name)} <span class="rtag">${'★'.repeat(r.stars)}</span></div><div class="rlock">${escapeHtml(t('r_locked_hint'))}</div></div>`;
        }
    });
    if (!recs.length) html += `<div class="cb-empty">${escapeHtml(t('craft_none_known'))}</div>`;
    box.innerHTML = html;
    box.querySelectorAll('.recipe[data-r]').forEach(b => b.onclick = () => craftSelect(v, b.dataset.r));
    const fb = box.querySelector('.recipe[data-free]'); if (fb) fb.onclick = () => craftSelect(v, 'free');
}

function cbRenderBench(v) {
    const box = cbEl('vc-bench'); if (!box) return;
    const r = cbCurRecipe(v);
    const outKey = benchSel === 'free' ? 'flask' : (r ? recipeIconKey(r) : 'spark');
    const ready = cbReady();
    const n = benchSlots.length, R = 39;
    const pos = benchSlots.map((_, i) => { const a = (-90 + i * 360 / Math.max(1, n)) * Math.PI / 180; return { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a) }; });
    const ticks = Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180, x1 = 50 + 45.5 * Math.cos(a), y1 = 50 + 45.5 * Math.sin(a), x2 = 50 + 48 * Math.cos(a), y2 = 50 + 48 * Math.sin(a); return `<line class="ring-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join('');
    const glyphs = Array.from({ length: 6 }, (_, i) => { const a = (i * 60 + 15) * Math.PI / 180, x = 50 + 42 * Math.cos(a), y = 50 + 42 * Math.sin(a); return `<circle class="ring-glyph" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1"/>`; }).join('');
    const lines = pos.map((pp, i) => `<line class="energy ${benchSlots[i].itemId ? 'on' : ''}" x1="50" y1="50" x2="${pp.x.toFixed(1)}" y2="${pp.y.toFixed(1)}"/>`).join('');
    const bag = cbBag(v);
    const slotEls = benchSlots.map((sl, i) => {
        const filled = !!sl.itemId; const it = filled ? bag.find(b => b.id === sl.itemId) : null;
        const key = filled ? ingIconKey(it ? it.name : '') : (sl.need ? ingIconKey(sl.need) : null);
        const inner = filled ? `<span class="chip">${cbIcon(key)}</span>` : (key ? `<span class="ghost">${cbIcon(key)}</span>` : `<span class="plus">+</span>`);
        const nm = filled ? (it ? it.name : '') : (sl.need || '');
        const cap = nm ? `<span class="snm">${escapeHtml(nm)}</span>` : '';
        return `<div class="slot ${filled ? 'filled' : 'want'}" data-i="${i}" title="${escapeHtml(nm)}" style="left:${pos[i].x}%;top:${pos[i].y}%">${inner}${cap}</div>`;
    }).join('');
    const qmap = { perfect: '#3f7d2f', good: '#b98a2f', bad: '#8a2c23' };
    const qtxt = { perfect: '★★★ ' + t('cb_perfect'), good: '★★ ' + t('cb_good'), bad: '★ ' + t('cb_bad') };
    const label = benchCrafted ? `<span style="color:${qmap[benchCraftedQ] || 'var(--sepia)'};font-weight:800">${escapeHtml(qtxt[benchCraftedQ] || '✦')}</span> — ${escapeHtml(benchCrafted)}` : (benchSlots.length ? (ready ? t('cb_closed') : t('cb_fill')) : t('brew_hint'));
    const isSharp = r && r.kind === 'sharpen';
    const isRepair = r && r.kind === 'repair';
    let sharpPicker = '';
    if (isSharp || isRepair) {
        const targets = gearTargets(v, r);
        if (sharpenTarget && !targets.some(x => x.key === sharpenTarget)) sharpenTarget = '';
        const headKey = isRepair ? 'repair_pick' : 'sharpen_pick';
        const noneKey = isRepair ? 'repair_none' : 'sharpen_none';
        sharpPicker = `<div class="cb-sharp"><div class="cb-sharp-h">${escapeHtml(t(headKey))}</div>` +
            (!eqApi() ? `<div class="cb-sharp-none">${escapeHtml(t('sharpen_noeq'))}</div>` :
                targets.length
                    ? `<select id="cb-sharptgt" class="cb-sharpsel"><option value="">${escapeHtml(t('sharpen_choose'))}</option>${targets.map(x => `<option value="${x.key}" ${sharpenTarget === x.key ? 'selected' : ''}>${escapeHtml(x.label)}</option>`).join('')}</select>`
                    : `<div class="cb-sharp-none">${escapeHtml(t(noneKey))}</div>`)
            + (isSharp && r.targetGrade === 4 ? `<div class="cb-sharp-warn">${escapeHtml(t('sharpen_risky'))}</div>` : '') + `</div>`;
    }
    const actKey = isSharp ? 'sharpen_btn' : (isRepair ? 'repair_btn' : (benchSel === 'free' ? 'free_btn' : 'craft_btn'));
    box.innerHTML = `<div class="col-h">${cbIcon('spark')}${escapeHtml(t('craft_section'))}</div>
        <div class="circle" id="cb-circle">
            <svg class="ring-svg" viewBox="0 0 100 100"><g class="ring"><circle class="ring-o" cx="50" cy="50" r="46.5"/><circle class="ring-i" cx="50" cy="50" r="43"/>${ticks}${glyphs}</g></svg>
            <svg class="line-svg" viewBox="0 0 100 100">${lines}</svg>
            <div class="cnode ${benchCrafted ? 'done' : (ready ? 'idle' : '')}"><span class="shine"></span>${cbIcon((isSharp || isRepair) ? 'spark' : outKey)}</div>
            ${slotEls}
        </div>
        <div class="rlabel">${label}</div>
        ${sharpPicker}
        <button class="craft-btn ${ready ? 'ready' : ''}" id="cb-do">${cbIcon('spark')}${escapeHtml(t(actKey))}</button>`;
    const stg = cbEl('cb-sharptgt'); if (stg) stg.onchange = () => { sharpenTarget = stg.value; };
    box.querySelectorAll('.slot.filled').forEach(el => el.onclick = () => craftUnslot(v, +el.dataset.i));
    box.querySelectorAll('.slot.want').forEach(el => {
        el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('dragover'); });
        el.addEventListener('dragleave', () => el.classList.remove('dragover'));
        el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('dragover'); const id = e.dataTransfer.getData('text/plain'); if (id) craftPlace(v, id); });
    });
    const d = cbEl('cb-do'); if (d) d.onclick = () => craftGo(v);
}

function cbRenderInv(v) {
    const box = cbEl('vc-igrid'); if (!box) return;
    const hh = cbEl('vc-ingh'); if (hh) hh.innerHTML = cbIcon('box') + escapeHtml(t('ingredients_side'));
    const inv = invApi(); const bag = inv ? inv.list() : [];
    const placed = new Set(benchSlots.map(s => s.itemId).filter(Boolean));
    const r = cbCurRecipe(v);
    const needSet = new Set((r ? (r.ingredients || []) : []).map(x => String(x).toLowerCase()));
    const agg = {};
    bag.forEach(m => { const k = m.name; if (!agg[k]) agg[k] = { name: m.name, desc: m.desc || '', ids: [], free: [] }; agg[k].ids.push(m.id); if (!placed.has(m.id)) agg[k].free.push(m.id); });
    const rows = Object.values(agg);
    if (!inv) box.innerHTML = `<div class="cb-empty">${escapeHtml(t('no_inv_shop'))}</div>`;
    else if (!rows.length) box.innerHTML = `<div class="cb-empty">${escapeHtml(t('no_materials'))}</div>`;
    else box.innerHTML = rows.map(a => {
        const c = a.free.length; const isNeed = needSet.has(a.name.toLowerCase()) && benchSlots.some(s => !s.itemId && s.need && s.need.toLowerCase() === a.name.toLowerCase());
        return `<div class="ing ${c <= 0 ? 'empty' : ''} ${isNeed && c > 0 ? 'match' : ''}" draggable="${c > 0 ? 'true' : 'false'}" data-id="${a.free[0] || a.ids[0]}"><div class="vial">${cbIcon(ingIconKey(a.name))}</div><div class="info"><div class="in">${escapeHtml(a.name)}</div><div class="ic">${escapeHtml(isNeed ? t('cb_needed') : (a.desc || t('cb_ingredient')))}</div></div><span class="cnt">×${c}</span></div>`;
    }).join('');
    // active foraging hunt — what to look for and where; the loupe turns these up while you search
    const fl = cbEl('vc-forage-list');
    if (fl) {
        const q = questApi();
        const pend = [];
        if (q) (q.listForage() || []).filter(x => x.vendorName === v.name).forEach(x => (x.ingredients || []).forEach(i => { if (!i.got) pend.push(i); }));
        if (pend.length) {
            fl.innerHTML = `<div class="fq-h">${escapeHtml(t('forage_active'))}</div>` + pend.slice(0, 12).map(i => `<div class="fq-row"><b>${escapeHtml(i.name)}</b>${i.where ? `<span>${escapeHtml(i.where)}</span>` : ''}</div>`).join('') + `<div class="fq-note">${escapeHtml(t('forage_hint'))}</div>`;
            fl.style.display = '';
        } else { fl.innerHTML = ''; fl.style.display = 'none'; }
    }
    box.querySelectorAll('.ing:not(.empty)').forEach(el => {
        el.onclick = () => craftPlace(v, el.dataset.id);
        el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
}

function craftSelect(v, id) { if (benchBusy) return; benchSel = id; cbBuildSlots(v); cbRenderAll(v); }
function craftPlace(v, itemId) {
    if (benchBusy || !benchSlots.length) return;
    const placed = new Set(benchSlots.map(s => s.itemId).filter(Boolean)); if (placed.has(itemId)) return;
    const item = cbBag(v).find(b => b.id === itemId); if (!item) return;
    let slot;
    if (benchSel === 'free') slot = benchSlots.find(s => !s.itemId);
    else slot = benchSlots.find(s => !s.itemId && s.need && s.need.toLowerCase() === item.name.toLowerCase());
    if (!slot) return;
    slot.itemId = itemId; benchCrafted = ''; cbRenderBench(v); cbRenderInv(v);
}
function craftUnslot(v, i) { if (benchBusy) return; const s = benchSlots[i]; if (s && s.itemId) { s.itemId = null; benchCrafted = ''; cbRenderBench(v); cbRenderInv(v); } }
function craftGo(v) {
    if (benchBusy || !cbReady()) return;
    const r = cbCurRecipe(v);
    if (r && (r.kind === 'sharpen' || r.kind === 'repair') && !sharpenTarget) { toastr.warning(t('sharpen_need_target')); return; }
    startCook(v);
}

function startCook(v) {
    benchBusy = true;
    const box = cbEl('vc-bench'); const circle = cbEl('cb-circle'); if (circle) circle.classList.add('heat');
    const lbl = box ? box.querySelector('.rlabel') : null;
    const zoneW = 19, zoneX = 20 + Math.random() * 56;
    if (lbl) lbl.outerHTML = `<div class="cook"><div class="cook-hint">${escapeHtml(t('cb_cookhint'))}</div><div class="track"><div class="zone" style="left:${zoneX}%;width:${zoneW}%"></div><div class="marker" id="cb-marker"><span class="fl">${cbIcon('flame')}</span></div></div></div>`;
    const btn = cbEl('cb-do'); if (btn) { btn.className = 'craft-btn ready cookbtn'; btn.innerHTML = cbIcon('flame') + escapeHtml(t('cb_stop')); }
    cbCook = { zoneX, zoneW, pos: Math.random() * 30, dir: 1, speed: 1.15, raf: 0 };
    const marker = cbEl('cb-marker'); let last = performance.now();
    function step(tm) { const dt = Math.min(3, (tm - last) / 16.7); last = tm; cbCook.pos += cbCook.dir * cbCook.speed * dt; if (cbCook.pos >= 100) { cbCook.pos = 100; cbCook.dir = -1; } if (cbCook.pos <= 0) { cbCook.pos = 0; cbCook.dir = 1; } if (marker) marker.style.left = cbCook.pos + '%'; cbCook.raf = requestAnimationFrame(step); }
    cbCook.raf = requestAnimationFrame(step);
    const stop = () => { if (!cbCook) return; cancelAnimationFrame(cbCook.raf); window.removeEventListener('keydown', cbKeyH); const center = cbCook.zoneX + cbCook.zoneW / 2, half = cbCook.zoneW / 2, d = Math.abs(cbCook.pos - center); const q = d <= half ? 'perfect' : (d <= half + 11 ? 'good' : 'bad'); cbCook = null; finishCraft(v, q); };
    if (btn) btn.onclick = stop;
    cbKeyH = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); stop(); } };
    window.addEventListener('keydown', cbKeyH);
}

async function finishCraft(v, q) {
    const inv = invApi();
    const usedIds = benchSlots.map(s => s.itemId).filter(Boolean);
    const r = cbCurRecipe(v);
    const circle = cbEl('cb-circle'); if (circle) { circle.classList.remove('heat'); circle.classList.add('casting'); }
    // resolve result
    let producedName = '';
    if (r && (r.kind === 'sharpen' || r.kind === 'repair')) {
        if (inv) usedIds.forEach(id => inv.remove(id)); // materials consumed regardless
        const eq = eqApi();
        const tgt = sharpenTarget || '';
        const isInv = tgt.startsWith('inv:');
        const invId = isInv ? tgt.slice(4) : null;
        const slot = (!isInv && tgt.startsWith('eq:')) ? tgt.slice(3) : null;
        const invItem = (isInv && inv) ? inv.list().find(i => i.id === invId) : null;
        if (r.kind === 'sharpen') {
            const cur = slot ? (eq ? eq.getGrade(slot) : 0) : (invItem ? (invItem.grade || 1) : 0);
            if ((slot || invItem) && cur === (r.targetGrade - 1)) {
                const ok = (r.targetGrade === 4) ? ((q !== 'bad') && Math.random() < 0.6) : (q !== 'bad');
                if (ok) {
                    let ng = cur + 1;
                    if (slot && eq) ng = eq.sharpen(slot);
                    else if (invItem && inv) inv.update(invItem.id, { grade: ng, dur: invItem.max || 100, broken: false });
                    producedName = t('sharpen_ok', { grade: t('grade_' + ng) }); addSkillXp(v, 8 + r.targetGrade * 4); benchCraftedQ = 'perfect';
                } else { producedName = t('sharpen_fail'); addSkillXp(v, 3); benchCraftedQ = 'bad'; }
            } else { producedName = t('sharpen_fail'); benchCraftedQ = 'bad'; }
        } else { // repair → restore durability (fully on a good run, partial on a bad one)
            const amt = (q === 'bad') ? 55 : 100;
            if (slot && eq) { eq.repair(slot, amt); producedName = t('repair_ok'); addSkillXp(v, 6); benchCraftedQ = q === 'bad' ? 'good' : 'perfect'; }
            else if (invItem && inv) { const mx = invItem.max || 100; inv.update(invItem.id, { dur: Math.min(mx, (invItem.dur || 0) + Math.round(mx * amt / 100)), broken: false }); producedName = t('repair_ok'); addSkillXp(v, 6); benchCraftedQ = q === 'bad' ? 'good' : 'perfect'; }
            else { producedName = t('repair_fail'); benchCraftedQ = 'bad'; }
        }
        sharpenTarget = '';
    } else if (benchSel !== 'free' && r) {
        if (inv) usedIds.forEach(id => inv.remove(id));
        if (q === 'bad') { // botched → junk item with a debuff
            addSkillXp(v, 3);
            producedName = (await addBotchedItem(v, r.name, craftItemType(v))) || r.name;
        } else {
            if (inv) inv.add(buildCraftedItem(v, r, q)); // effect fires when eaten / worn — not now
            addSkillXp(v, (q === 'perfect' ? 16 : q === 'bad' ? 5 : 10) + r.stars * 3);
            producedName = r.name;
        }
    } else {
        // freestyle → produce an ITEM (its effect triggers on use/wear), success by skill + quality
        const items = usedIds.map(id => cbBag(v).find(b => b.id === id)).filter(Boolean);
        const out = await freestyleResolve(v, items, q);
        producedName = out ? out.name : '\u2717';
        benchCraftedQ = (out && out.success) ? q : 'bad';
    }
    saveState();
    setTimeout(() => {
        benchSlots.forEach(s => s.itemId = null);
        benchCrafted = producedName; if (benchSel !== 'free' && !(r && (r.kind === 'sharpen' || r.kind === 'repair'))) benchCraftedQ = q;
        benchBusy = false;
        cbRenderBench(v); cbRenderInv(v); cbRenderRecipes(v);
        const node = document.querySelector('#vc-bench .cnode');
        if (node) {
            const col = benchCraftedQ === 'perfect' ? 'rgba(90,150,60,.4)' : benchCraftedQ === 'bad' ? 'rgba(138,44,35,.4)' : 'rgba(200,161,47,.32)';
            node.style.boxShadow = `0 0 0 6px ${col},0 8px 18px -6px rgba(0,0,0,.4)`;
            const N = benchCraftedQ === 'perfect' ? 12 : (benchCraftedQ === 'bad' ? 5 : 8);
            for (let k = 0; k < N; k++) { const sp = document.createElement('span'); sp.className = 'spark'; sp.style.left = '50%'; sp.style.top = '50%'; if (benchCraftedQ === 'bad') sp.style.background = '#8a2c23'; if (benchCraftedQ === 'perfect') sp.style.background = '#7bbf3a'; const a = (k / N) * 6.28, rr = benchCraftedQ === 'perfect' ? 58 : 46, dx = Math.cos(a) * rr, dy = Math.sin(a) * rr; sp.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1)`, opacity: 0 }], { duration: 680, easing: 'ease-out' }); node.parentElement.appendChild(sp); setTimeout(() => sp.remove(), 700); }
        }
        toastr.success(t('craft_done', { name: producedName }));
    }, 600);
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
const TYPE_SVG = { blacksmith:'hammer', tailor:'scissors', apothecary:'mortar', cook:'utensils', merchant:'store', jeweler:'gem', trainer:'person', other:'person' };
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
    const modal = document.getElementById('rpg-vnd-modal');
    const wide = modal && modal.classList.contains('vnd-wide');
    // Craft (wide) tab: the triptych is a real flex layout that reflows on its own.
    // Do NOT transform-scale it — scaling fought the layout and squeezed the 3rd panel
    // out. Left untouched, flexbox gives the three columns their full width and wraps
    // only on genuinely narrow screens.
    if (wide) {
        fit.style.transform = 'none';
        fit.style.transformOrigin = 'top center';
        fit.style.height = 'auto';
        return;
    }
    fit.style.transform = 'none';
    fit.style.height = 'auto'; // let the panel take its natural content height before measuring
    const design = 460;              // the panel's visual design width
    const cap = 472;
    const availW = Math.min(cap, window.innerWidth * 0.96) - 4;
    const s = Math.min(1, availW / design); // width-only: never resize by content height (no jumps)
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
    if (view !== 'workshop') $('#rpg-vnd-modal').removeClass('vnd-wide');
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
    const tabsAll = [['profile', t('tab_profile'), 'brief'], ['shop', t('tab_shop'), 'cart'], ['jobs', t('tab_jobs'), 'file'], ['repair', t('tab_repair'), 'wrench'], ['recipes', t('tab_recipes'), 'wand'], ['craft', v.type === 'trainer' ? t('tab_train') : t('tab_craft'), 'wand']];
    let tabs = tabsAll;
    if (v.type === 'trainer') tabs = tabs.filter(x => x[0] !== 'recipes'); // trainers don't craft
    // repair fits menders: tailors, blacksmiths, general merchants, and custom vendors
    if (!['tailor', 'blacksmith', 'merchant', 'other'].includes(v.type)) tabs = tabs.filter(x => x[0] !== 'repair');
    return `<div class="vnf-view">
      <div class="vnf-chrome">
        <div class="vnf-crumb">
          <button class="vnf-btn b-paper" id="v-back">${ic('back')}${escapeHtml(t('back'))}</button>
          <button class="vnf-btn b-ghost" id="v-edit">${ic('edit')}${escapeHtml(t('edit'))}</button>
          <button class="vnf-btn b-red" id="v-del">${ic('trash')}${escapeHtml(t('del'))}</button>
          <button class="vnf-btn b-ghost" id="v-leave">${ic('leave')}${escapeHtml(t('leave'))}</button>
        </div>
        <div class="vnf-tabs">${tabs.map(tb => `<button class="vnf-tab ${tab === tb[0] ? 'active' : ''}" data-t="${tb[0]}">${ic(tb[2])}<span class="lab">${escapeHtml(tb[1])}</span></button>`).join('')}</div>
      </div>
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
    else if (tab === 'recipes') {
        ensureSkill(v); ensureRecipes(v);
        const sk = v.skill;
        const pct = sk.level >= MAX_SKILL_LEVEL ? 100 : Math.round(sk.xp / SKILL_XP * 100);
        h += `<div class="vnf-skill"><div class="vnf-skill-top"><span class="vnf-skill-name">${ic('wand')} ${escapeHtml(sk.name)}</span><span class="vnf-skill-lv">${escapeHtml(t('lvl_short'))} ${sk.level}/${MAX_SKILL_LEVEL}</span></div><div class="vnf-skill-bar"><div class="vnf-skill-fill" style="width:${pct}%"></div></div></div>`;
        h += `<div style="margin:8px 0 10px"><button class="vnf-btn b-violet vnf-genrec" style="width:100%">${ic('wand')}${escapeHtml(t('recipes_gen'))}</button></div>`;
        const recs = v.recipes || [];
        if (!recs.length) h += `<div class="vnf-empty">${escapeHtml(t('recipes_none'))}</div>`;
        else h += recs.map(r => {
            const isSharp = r.kind === 'sharpen';
            const isRep = r.kind === 'repair';
            const special = isSharp || isRep;
            const gnum = isSharp ? r.targetGrade : (isRep ? (r.tier + 1) : r.stars);
            const stars = '\u2605'.repeat(gnum) + '\u2606'.repeat(5 - gnum);
            const desc = isSharp ? t('sharpen_recipe_desc', { grade: t('grade_' + r.targetGrade), cat: t(r.category === 'weapon' ? 'sharpen_cat_weapon' : 'sharpen_cat_armor') })
                : (isRep ? t('repair_recipe_desc', { cat: t(r.category === 'weapon' ? 'sharpen_cat_weapon' : 'sharpen_cat_armor') }) : '');
            return `<div class="vnf-recipe ${r.learned ? 'known' : ''} ${special ? 'sharp' : ''}">
                <div class="rc-top"><span class="rc-nm">${isSharp ? '⚒ ' : (isRep ? '🛠 ' : '')}${escapeHtml(r.name)}</span><span class="rc-stars">${stars}</span></div>
                ${special
                    ? `<div class="rc-flavor">${escapeHtml(desc)}</div>${r.learned ? `<div class="rc-ing"><b>${escapeHtml(t('recipe_ing'))}</b> ${escapeHtml(r.ingredients.join(', ') || '\u2014')}</div>` : ''}`
                    : (r.learned
                        ? `<div class="rc-ing"><b>${escapeHtml(t('recipe_ing'))}</b> ${escapeHtml(r.ingredients.join(', ') || '\u2014')}</div>`
                        : (r.flavor ? `<div class="rc-flavor">${escapeHtml(r.flavor)}</div>` : ''))}
                ${r.result ? `<div class="rc-res"><b>${escapeHtml(t('recipe_res'))}</b> ${escapeHtml(r.result)}</div>` : ''}
                <div class="rc-foot">${r.learned ? `<span class="rc-known">${ic('check')} ${escapeHtml(t('r_known'))}</span>` : `<span class="rc-price">${ic('coin')} ${r.price}</span><button class="vnf-btn b-navy vnf-learn" data-id="${r.id}">${ic('cart')}${escapeHtml(t('r_learn'))}</button>`}</div>
            </div>`;
        }).join('');
    }
    else if (tab === 'craft') {
        ensureSkill(v);
        if (v.type === 'trainer') {
            ensureTraining(v);
            h += skillHeaderHtml(v);
            if (!v.training.length) {
                h += `<div class="vnf-empty">${escapeHtml(t('train_empty'))}</div>`;
                h += `<button class="vnf-btn b-violet vnf-tgen" style="width:100%">${ic('wand')}${escapeHtml(t('train_gen'))}</button>`;
            } else {
                const mains = mainsAt(v, v.skill.level);
                const mainsDone = mains.filter(q => q.done).length;
                h += `<div class="vnf-sech">${escapeHtml(t('train_main_sec'))} <span class="tq-count">${mainsDone}/${mains.length || 2}</span></div>`;
                const show = v.training.filter(q => q.grad ? v.skill.level >= 5 : (q.minLevel === v.skill.level || q.minLevel === v.skill.level + 1));
                h += show.map(q => trainCardHtml(v, q)).join('');
                if (v.skill.level < MAX_SKILL_LEVEL && levelReady(v)) h += `<div class="vnf-tnote">${ic('wand')}<span>${escapeHtml(t('train_can_advance'))}</span></div>`;
                h += `<div class="vnf-sech" style="margin-top:12px">${escapeHtml(t('train_drill_sec'))}</div>`;
                if (!(v.drills || []).length) h += `<div class="vnf-empty">${escapeHtml(t('drill_empty'))}</div>`;
                else h += v.drills.map(d => drillCardHtml(v, d)).join('');
                h += `<div class="vnf-footrow" style="justify-content:flex-end;gap:8px;margin-top:2px"><button class="vnf-btn b-ghost vnf-drillgen tq-new">${escapeHtml(t('drill_regen'))}</button><button class="vnf-btn b-ghost vnf-tgen tq-new">${ic('wand')}${escapeHtml(t('train_regen'))}</button></div>`;
            }
            h += `<div class="vnf-tnote">${ic('wand')}<span>${escapeHtml(t('train_note2'))}</span></div>`;
        } else {
            const pc = v.skill.level >= MAX_SKILL_LEVEL ? 100 : Math.round(v.skill.xp / SKILL_XP * 100);
            h += `<div class="vb-chead">${ic('wand')}<span class="vb-chn">${escapeHtml(v.skill.name)}</span><span class="vb-chl">${escapeHtml(t('lvl_short'))} ${v.skill.level}/${MAX_SKILL_LEVEL}</span><span class="vb-chbar"><span style="width:${pc}%"></span></span></div>`;
            h += `<div class="rpg-cb"><div class="tri">
                <div class="col side rec"><div class="col-h" id="vc-rech"></div><div class="rlist" id="vc-rlist"></div></div>
                <div class="col bench"><div class="bench-in" id="vc-bench"></div></div>
                <div class="col side ing"><div class="col-h" id="vc-ingh"></div><div class="cb-iact"><button class="vnf-btn b-violet vc-forage">${ic('wand')}${escapeHtml(t('forage_take'))}</button></div><div class="vc-forage-list" id="vc-forage-list"></div><div class="igrid" id="vc-igrid"></div></div>
            </div></div>`;
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
    // recipes
    body.find('.vnf-genrec').off('click').on('click', () => generateRecipes(v));
    body.find('.vnf-learn').off('click').on('click', function () { learnRecipe(v, $(this).data('id')); });
    // craft / ingredients / training
    body.find('.vnf-forage').off('click').on('click', () => takeForageQuest(v));
    body.find('.vnf-craftbtn').off('click').on('click', function () { craftRecipe(v, $(this).data('id')); });
    body.find('.vnf-matcb').off('change').on('change', function () { const n = body.find('.vnf-matcb:checked').length; body.find('.vnf-freebtn').prop('disabled', n < 2); });
    body.find('.vnf-freebtn').off('click').on('click', () => { const ids = body.find('.vnf-matcb:checked').map(function () { return $(this).val(); }).get(); freestyleCraft(v, ids); });
    if (tab === 'craft' && v.type !== 'trainer') {
        $('#rpg-vnd-modal').addClass('vnd-wide');
        mountCraft(body, v);
    } else {
        $('#rpg-vnd-modal').removeClass('vnd-wide');
    }
    body.find('.vnf-tgen').off('click').on('click', () => generateTraining(v));
    body.find('.vnf-drillgen').off('click').on('click', () => generateDrills(v));
    body.find('.tq-do').off('click').on('click', function () { const q = findTrainQuest(v, this.dataset.q); if (q) doPractice(v, q); });
    body.find('.tq-take').off('click').on('click', function () { const q = findTrainQuest(v, this.dataset.q); if (q) takeField(v, q); });
    body.find('.tq-done-btn').off('click').on('click', function () { const q = findTrainQuest(v, this.dataset.q); if (q) selfComplete(v, q); });
    body.find('.tq-check').off('click').on('click', function () { const q = findTrainQuest(v, this.dataset.q); if (q) checkField(v, q); });
    body.find('.tq-fail').off('click').on('click', function () { const q = findTrainQuest(v, this.dataset.q); if (q) declineQuest(v, q); });
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
            <label class="checkbox_label"><input type="checkbox" id="rpg-vnd-reqai"> ${t('set_reqai')}</label>
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
    $('#rpg-vnd-reqai').prop('checked', !!settings.requireAiCheck).on('change', function () { settings.requireAiCheck = this.checked; saveSettings(); });
    $('#rpg-vnd-cardinject').prop('checked', settings.cardInject !== false).on('change', function () { settings.cardInject = this.checked; saveSettings(); buildInjection(); buildCardInjection(); });
    $('#rpg-vnd-questglobal').prop('checked', settings.questGlobal !== false).on('change', function () { settings.questGlobal = this.checked; saveSettings(); buildInjection(); });
    $('#rpg-vnd-needpresence').prop('checked', !!settings.questsNeedPresence).on('change', function () { settings.questsNeedPresence = this.checked; saveSettings(); renderPanel(); });
}

async function maybeDropBrokenGear() {
    if (!settings.enabled) return;
    const inv = invApi(); if (!inv) return;
    const ctx = getContext(); const chatId = ctx.chatId; if (!chatId) return;
    if (!settings.chatStates) settings.chatStates = {};
    const cs = settings.chatStates[chatId] || (settings.chatStates[chatId] = {});
    if (cs.brokenDropped) return;               // fire at most once per chat
    cs.brokenDropped = true; saveSettings();
    if (Math.random() > 0.3) return;            // ~30% of new chats start with a broken find
    const vendors = (state.vendors || []).filter(v => ['blacksmith', 'tailor', 'merchant', 'other'].includes(v.type));
    try {
        const kinds = [['weapon', 'a broken weapon'], ['armor', 'a damaged piece of armour'], ['clothing', 'a torn garment']];
        const pick = kinds[Math.floor(Math.random() * kinds.length)];
        const sys = `Invent ONE ${pick[1]} the character stumbles on at the start of a scene, fitting the WORLD/ERA/setting below. Give a short "name" and a one-line "desc". Write in ${genLang()}. Output JSON: {"name":"","desc":""}`;
        const res = await callAI(sys, settingContext());
        const name = String((res && res.name) || 'Broken item').slice(0, 50);
        const desc = String((res && res.desc) || '').slice(0, 120);
        inv.add({ name, desc, type: pick[0], dur: 0, max: 100, broken: true, grade: (Math.random() < 0.15 ? 3 : (Math.random() < 0.4 ? 2 : 1)) });
        if (vendors.length) {
            const v = vendors[Math.floor(Math.random() * vendors.length)];
            if (!Array.isArray(state.quests)) state.quests = [];
            state.quests.push({ id: genId(), vendorId: v.id, type: 'repair', title: t('brokendrop_qtitle', { name }), desc: t('brokendrop_qdesc', { name, vendor: v.name }), requirement: t('brokendrop_qreq', { name }), reward: { kind: 'repair', name, amount: 100 }, status: 'available' });
            saveState(); renderPanel();
            if (settings.autoChatNote) insertChatNote(t('brokendrop_note', { user: ctx.name1 || 'I', name, vendor: v.name, role: vendorRole(v).toLowerCase() }));
        } else {
            saveState();
            if (settings.autoChatNote) insertChatNote(t('brokendrop_note_novendor', { user: ctx.name1 || 'I', name }));
        }
        toastr.info(t('brokendrop_toast', { name }));
    } catch (e) { console.error('broken drop', e); }
}

jQuery(() => {
    loadSettings();
    setupUI();
    if (getContext().chatId) { loadState(); renderButton(); buildInjection(); buildCardInjection(); restoreVendorButtons(); }

    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => { loadState(); view = 'list'; renderButton(); renderPanel(); buildInjection(); buildCardInjection(); restoreVendorButtons(); maybeDropBrokenGear(); }, 100);
    });
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => restoreVendorButtons());
    eventSource.on(event_types.MESSAGE_EDITED, () => restoreVendorButtons());
    eventSource.on(event_types.GENERATION_STARTED, () => { try { buildCardInjection(); } catch (e) {} });
});

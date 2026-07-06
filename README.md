# RPG Vendors & Workshops

A SillyTavern extension that adds **vendors and workshops** to your RPG — shops to trade with, craftsmen to take jobs from, and workbenches to **repair your broken gear** using materials from your backpack, with the model judging whether that material can plausibly do the job.

> This is the **connective tissue** of the RPG suite. It runs on its own, but shines next to **Tavern RPG Engine** (the inventory that supplies materials & coins) and **RPG Equipment & Durability** (the gear that wears out). When those are on, it talks to them through the shared `window.RPG` bridge; when they're off, the vendor simply tells you so.

**Version 1.16.6**

---

## ✨ Features

- 🧑‍🏭 **Vendors, your way** — create them with a name, a type (blacksmith, tailor, apothecary, cook, merchant, jeweler…) and your own description. Full edit / delete.
- ✨ **Auto from lore** — one button asks the model to invent a fitting vendor (optionally letting it pick the type), or link one to a character card.
- 🗂️ **Dossier view** with tabs: **Profile · Shop · Jobs · Repair**, in a case-file aesthetic; a per-message button jumps you to the right vendor.
- 🛒 **Shop** — the vendor lays out wares (AI restock); **buy & sell** against your coins. Needs the inventory module. You can also just **give coins** to a vendor.
- 📜 **Jobs & quests** — ask for work; rewards come as an **item, a repair, coins, or an effect**. Accept and complete from the card; the arrangement is injected so the vendor NPC actually knows about it. Optional scene-wide visibility and **presence-gating** (take work only when the story has you at the vendor).
- 🔧 **Repair** — bring a damaged piece of gear and **offer a material** from your backpack; the model decides whether it can plausibly fix it, then applies a repair % (and uses up / wears down the material) or refuses in character. Needs the equipment module.
- 📝 **Scene notes** — optional italic notes dropped into chat for trades, jobs and repairs, so the story stays in sync.
- 🌍 **Bilingual (RU / EN)**; saved per chat.

## 📦 Install

Copy the `RPG-Vendors-Workshops` folder into your third-party extensions folder (e.g. `SillyTavern/data/<user>/extensions/`), reload, and enable it under **Extensions → RPG Vendors & Workshops**.

## ⚙️ Setup

1. Enable the module and pick a **Language**.
2. Fill in an OpenAI-compatible **URL / API Key / Model** (default `google/gemma-4-31b-it`) — used for auto-vendors, restock, jobs and repair judgements.
3. For trading and repair, also enable **Tavern RPG Engine** (inventory) and **RPG Equipment & Durability** — the shop needs coins/items, and repair needs gear.
4. Optional toggles: inject vendor knowledge (goods & active quests), make quests scene-wide or card-only, and gate quests behind being at the vendor.

## 🧠 How it works

Each vendor is a little NPC dossier. **Shop** and **restock** generate believable wares for that vendor's trade and move coins/items through your inventory. **Jobs** post a short task with a reward and inject the arrangement so the vendor plays along in the scene. **Repair** is the heart of it: you pick a broken slot and offer a backpack item; the model rules on whether (say) a scrap of leather can mend those boots, and if so how much — then the durability is restored via the equipment bridge and the material is consumed or worn down.

## 🔌 Cross-extension bridge

Reads `window.RPG.inventory` (materials, coins, buy/sell), `window.RPG.equipment` (gear to repair) and `window.RPG.vitals` (effect rewards). Everything is optional-chained, so missing modules degrade gracefully instead of breaking.

## 🩺 Troubleshooting

- **"Inventory module is off — the shop needs it."** Enable Tavern RPG Engine.
- **Can't repair gear.** Enable RPG Equipment & Durability; you also need a material in your backpack to offer.
- **Restock / jobs / repair do nothing.** They need a working URL / key / model.

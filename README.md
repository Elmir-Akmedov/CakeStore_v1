# 🎂 Cake Store Manager

![Django](https://img.shields.io/badge/Django-4.x-green)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Status](https://img.shields.io/badge/status-in--development-orange)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

A **web-based management game** built with **Django** where players run a bakery: bake cakes, fulfill orders, hire workers, and grow reputation.

---

# 📦 Table of Contents

* [Features](#-features)
* [Tech Stack](#-tech-stack)
* [Installation](#-installation)
* [Project Structure](#-project-structure)
* [Game Loop](#-game-loop)
* [API Reference](#-api-reference)
* [Models](#-models)
* [Game Engine](#-game-engine)
* [Frontend](#-frontend)
* [Future Improvements](#-future-improvements)

---

# ✨ Features

* Real-time game loop (polling state every 2 seconds)
* Baking system with timers
* Worker management (hire, fire, assign)
* Order generation and fulfillment
* Economy (money, reputation, upgrades)
* Multiple ovens with speed modifiers
* Day cycle system

---

# 🧰 Tech Stack

**Backend**

* Django
* Python
* SQLite (default)

**Frontend**

* HTML
* CSS (custom dark UI)
* Vanilla JavaScript

---

# ⚙️ Installation

## 1. Clone repository

```bash
git clone https://github.com/yourusername/cake-store-manager.git
cd cake-store-manager
```

## 2. Create virtual environment

```bash
python -m venv venv
source venv/bin/activate   # Linux/Mac
venv\Scripts\activate      # Windows
```

## 3. Install dependencies

```bash
pip install -r requirements.txt
```

## 4. Run migrations

```bash
python manage.py migrate
```

## 5. Start server

```bash
python manage.py runserver
```

## 6. Open browser

```
http://127.0.0.1:8000/
```

---

# 📁 Project Structure

```
Simple_cake_store\
├── manage.py
├── requirements.txt
├── cakestore\
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── game\
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── game_engine.py
│   ├── models.py
│   ├── urls.py
│   ├── views.py
│   └── management\
│       ├── __init__.py
│       └── commands\
│           ├── __init__.py
│           └── seed_recipes.py
├── templates\
│   └── game\
│       └── index.html
└── static\
    ├── css\
    │   └── style.css
    └── js\
        └── game.js
```

---

# 🔁 Game Loop

1. Player starts game
2. Opens store
3. Orders begin spawning
4. Player bakes cakes
5. Player fulfills orders
6. Earn money + reputation
7. End day → summary report
8. Repeat

---

# 📡 API Reference

## Base URL

```
/api/
```

---

## 🧠 Game State

### GET `/api/state/`

Returns full game state

**Response**

```json
{
  "money": 500,
  "day": 1,
  "ovens": [],
  "workers": []
}
```

---

## ▶️ Game Control

### POST `/api/start/`

Start new game

### POST `/api/open/`

Open store for the day

### POST `/api/end-day/`

End current day

---

## 🍰 Baking

### POST `/api/bake/`

```json
{
  "recipe_id": 1,
  "size": "Medium",
  "oven_id": 1
}
```

---

## 🛎 Orders

### POST `/api/fulfill/`

```json
{
  "order_id": 5
}
```

---

## 👥 Workers

### POST `/api/hire/`

```json
{ "role": "baker" }
```

### POST `/api/fire/`

```json
{ "worker_id": 2 }
```

### POST `/api/assign/`

```json
{
  "worker_id": 2,
  "oven_id": 1
}
```

### POST `/api/worker-mode/`

```json
{
  "worker_id": 2,
  "work_mode": "auto"
}
```

---

## 🔥 Ovens

### POST `/api/buy-oven/`

```json
{ "tier": "pro" }
```

---

# 🗄 Models

## GameState

* store_name
* day
* money
* reputation
* is_open

## Oven

* name
* tier
* speed_bonus
* is_active

## Worker

* name
* role
* skill levels
* assigned oven

## CustomerOrder

* recipe
* size
* deadline

## BakedCake

* recipe
* size
* slices

---

# ⚙️ Game Engine

Handles all business logic:

* `start_baking()`
* `fulfill_order()`
* `end_day()`
* `hire_worker()`
* `buy_oven()`

This keeps views thin and clean.

---

# 🎨 Frontend

## HTML

* 3-column dashboard layout
* Tabs for ovens, baking, orders, staff

## CSS

* Dark theme
* Responsive design
* Animations (progress bars, pulses)

## JS

* Polls `/api/state/`
* Updates UI dynamically
* Handles user actions

---

# 🚀 Future Improvements

## Backend

* Add authentication
* Use Django REST Framework
* Add WebSockets (real-time updates)

## Gameplay

* Upgrades system
* Worker leveling
* Random events

## Frontend

* React/Vue migration
* Better animations

---

# 📜 License

MIT License

---

# 👨‍💻 Author

Elmir Seyidehmedov

---

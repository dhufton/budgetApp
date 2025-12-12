# budgetApp/src/config.py

# Monthly Budget Targets (in GBP)
BUDGET_LIMITS = {
    "Rent": 1900.00,
    "Groceries": 400.00,
    "Dining Out": 200.00,
    "Transport": 150.00,
    "Shopping": 300.00,
    "Football": 100.00,
    "Utilities": 250.00,
    "Savings": 500.00
}

# Categorization Keywords
CATEGORY_RULES = {
    "Rent": ["Stein McBride", "ManillaSt"],
    "Groceries": ["Tesco", "Sainsbury", "Ocado", "Waitrose", "Lidl", "Aldi", "Marks & Spencer", "Tian Tian"],
    "Dining Out": ["Nandos", "Pizza Hut", "McDonald's", "Uber Eats", "Pret", "Coffee", "Tortilla",
                   "Origin Coffee", "Neama", "Burger King", "Wingstop", "Borough Market", "Humble Crumble",
                   "Deliveroo", "Papa John"],
    "Leisure": ["Nottingham Forest", "Forest", "Golf", "N1 London", "Fellows Morton"],
    "Coffee": ["WatchHouse", "Origin Coffee", "Nero"],
    "Transport": ["TFL", "Uber", "Trainline", "Shell", "BP"],
    "Shopping": ["Amazon", "End.", "Boots", "Fortnum", "Apple", "Skin + Me", "Kitchen Prov", "Steam Games",
                 "Aesop", "TK Maxx", "Søstrene", "Co-op", "M&S", "Electronic Arts", "Whittard of Chelsea"],
    "Utilities": ["British Gas", "Thames Water", "Council Tax", "Hyperoptic", "O2", "Sky"],
    "Savings": ["Chase Saver", "Round Up"],
    "Credit Cards": ["American Express", "To John Lewis", "NewDay"],
    "Ignore": ["3305 JPMCB", "Hannah Bince", "Adelle Gamble", "Credit Payments", "Internal Transfer", "Refund", "Payment"]
}

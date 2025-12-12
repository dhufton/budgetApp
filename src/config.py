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
    "Groceries": ["Tesco", "Sainsbury", "Ocado", "Waitrose", "Lidl", "Aldi"],
    "Dining Out": ["Nandos", "Pizza Hut", "McDonalds", "Uber Eats", "Pret", "Coffee", "Tortilla", "Origin Coffee"],
    "Football": ["Nottingham Forest", "Ticket", "Forest"],
    "Transport": ["TFL", "Uber", "Trainline", "Shell", "BP"],
    "Shopping": ["Amazon", "End.", "Boots", "Fortnum", "Apple", "Skin + Me"],
    "Utilities": ["British Gas", "Thames Water", "Council Tax", "Hyperoptic", "O2"],
    "Savings": ["Chase Saver", "Round Up"],
    "Credit Cards": ["American Express", "To John Lewis"]
}

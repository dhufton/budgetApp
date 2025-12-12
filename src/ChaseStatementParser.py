import pdfplumber
import re
import pandas as pd
from pathlib import Path
from config import CATEGORY_RULES


class ChaseStatementParser:
    """
    Parses Chase UK PDF bank statements into a structured DataFrame.
    """

    def __init__(self):
        # Regex to capture the date at the start of a line (e.g. "01 Nov 2025")
        self.date_pattern = re.compile(r"^(\d{2}\s[A-Za-z]{3}\s\d{4})")

        # Regex to capture financial amounts (e.g. "-£14.50", "+£1,200.00")
        # Captures group 1: The full amount string including sign and currency
        self.money_pattern = re.compile(r"([+-]?£[\d,]+\.\d{2})")

    def parse(self, file_path: Path) -> pd.DataFrame:
        """
        Main entry point: Reads a PDF and returns a clean, categorized DataFrame.
        """
        raw_transactions = []

        try:
            with pdfplumber.open(file_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    page_transactions = self._extract_page(page)
                    raw_transactions.extend(page_transactions)

        except Exception as e:
            print(f"Error reading PDF: {e}")
            return pd.DataFrame()

        return self._clean_and_categorize(raw_transactions)

    def _extract_page(self, page):
        """
        Iterates through lines on a single page to build transaction objects.
        """
        text = page.extract_text()
        if not text:
            return []

        lines = text.split('\n')
        transactions = []
        current_trans = {}

        for line in lines:
            # 1. Detect New Transaction (starts with Date)
            date_match = self.date_pattern.match(line)

            if date_match:
                # Save previous transaction if it exists
                if current_trans:
                    transactions.append(current_trans)

                # Initialize new transaction
                current_trans = {
                    "Date": date_match.group(1),
                    "Description": line[len(date_match.group(1)):].strip(),
                    "Amount": None,
                    "Balance": None
                }

                # Check if Amount/Balance are on this same line (common in Chase PDFs)
                money_matches = self.money_pattern.findall(line)
                self._assign_money_values(current_trans, money_matches, line)

            # 2. Process Continuation Lines (Description or late-appearing amounts)
            elif current_trans:
                # Ignore page headers/footers
                if self._is_junk_line(line):
                    continue

                money_matches = self.money_pattern.findall(line)

                if money_matches:
                    # Found money on a subsequent line
                    self._assign_money_values(current_trans, money_matches, line)
                else:
                    # Just text -> append to description
                    current_trans["Description"] += " " + line.strip()

        # Append the final transaction from the page
        if current_trans:
            transactions.append(current_trans)

        return transactions

    def _assign_money_values(self, trans_dict, money_matches, line_text):
        """
        Helper to safely assign Amount and Balance from regex matches.
        """
        if len(money_matches) >= 2:
            trans_dict["Amount"] = money_matches[-2]
            trans_dict["Balance"] = money_matches[-1]
            # Clean description by removing the money strings
            clean_desc = trans_dict["Description"].replace(trans_dict["Amount"], "")
            clean_desc = clean_desc.replace(trans_dict["Balance"], "")
            trans_dict["Description"] = clean_desc.strip()

        elif len(money_matches) == 1 and trans_dict["Amount"] is None:
            # If we haven't found an amount yet, this single value is likely it
            trans_dict["Amount"] = money_matches[0]

    def _is_junk_line(self, line):
        """Filters out headers, footers, and summary tables."""
        junk_markers = [
            "Account number:",
            "Page ",
            "Opening balance",
            "Closing balance",
            "Dylan's Account statement",
            "Money in",
            "Money out"
        ]
        return any(marker in line for marker in junk_markers)

    def _clean_and_categorize(self, data):
        df = pd.DataFrame(data)
        if df.empty: return df

        # Clean Amount
        df['Amount'] = df['Amount'].astype(str).str.replace('£', '').str.replace(',', '')
        df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0.0)

        # Parse Dates
        df['Date'] = pd.to_datetime(df['Date'], format='%d %b %Y', errors='coerce')

        # Categorize
        df['Category'] = df['Description'].apply(self._get_category)

        # LOGIC CHANGE:
        # 1. Keep all "Savings" transactions (both positive and negative)
        # 2. Keep all other negative transactions (Expenses)
        # 3. Drop other income (Salary, refunds, etc) as we only track spending/savings

        is_savings = df['Category'] == 'Savings'
        is_expense = df['Amount'] < 0

        # Return rows that are EITHER savings OR expenses
        return df[is_savings | is_expense].copy()

    def _get_category(self, description):
        """
        Matches description against rules in src/config.src
        """
        description_upper = str(description).upper()

        for category, keywords in CATEGORY_RULES.items():
            for keyword in keywords:
                if keyword.upper() in description_upper:
                    return category

        return "Uncategorized"


# -------------------------------------------------------------------------
# SMOKE TEST (Run this file directly to test)
# -------------------------------------------------------------------------
if __name__ == "__main__":
    # Point this to your actual file
    sample_pdf = Path("data/raw/Statements_for_01_November_2025_to_30_November_2025.pdf")

    if sample_pdf.exists():
        parser = ChaseStatementParser()
        df = parser.parse(sample_pdf)

        print(f"Successfully parsed {len(df)} transactions.")
        print("\n--- Sample Data ---")
        print(df.head())

        print("\n--- Category Breakdown ---")
        print(df.groupby('Category')['Amount'].sum())
    else:
        print("PDF file not found. Please check the path.")

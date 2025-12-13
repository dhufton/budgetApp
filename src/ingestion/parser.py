# budgetApp/src/ingestion/parser.py
import pdfplumber
import re
import pandas as pd
import csv
from config import CATEGORY_RULES
from ingestion.learning import load_learned_rules


class ChaseStatementParser:
    def __init__(self):
        self.date_pattern = re.compile(r"^(\d{2}\s[A-Za-z]{3}\s\d{4})")
        self.money_pattern = re.compile(r"([+-]?£[\d,]+\.\d{2})")

    def parse_multiple(self, file_paths):
        """Parses a list of file paths and returns a combined DataFrame."""
        all_data = []
        for path in file_paths:
            try:
                print(f"DEBUG: Parsing {path}...")  # Add this debug print
                df = self.parse(path)

                if not df.empty:
                    all_data.append(df)
                    print(f"DEBUG: Success - Found {len(df)} rows.")
                else:
                    print(f"DEBUG: Warning - No transactions found in {path}")

            except Exception as e:
                print(f"ERROR Parsing {path}: {e}")
                # We continue to the next file instead of crashing

        # FIX: Check if we have data before concatenating
        if not all:
            print("DEBUG: No valid data found in ANY file.")
            return pd.DataFrame()

        combined_df = pd.concat(all_data, ignore_index=True)
        return combined_df.drop_duplicates()

    def parse(self, file_path):
        raw_transactions = []
        closing_balance = None  # New variable to track balance

        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                # 1. Extract transactions (existing logic)
                raw_transactions.extend(self._extract_page(page))

                # 2. Extract Closing Balance (New Logic)
                # Look for the footer string on the last page usually
                text = page.extract_text()
                # Regex for "Closing balance £954.74"
                balance_match = re.search(r"Closing balance\s+£([\d,]+\.\d{2})", text)
                if balance_match:
                    val = balance_match.group(1).replace(',', '')
                    closing_balance = float(val)

        df = self._clean_and_categorize(raw_transactions)

        # Add the closing balance to the DataFrame (we'll just use the max date to tag it)
        if not df.empty and closing_balance:
            # We attach it as metadata to the dataframe
            df.attrs['closing_balance'] = closing_balance

        return df

    def _extract_page(self, page):
        text = page.extract_text()
        if not text: return []

        lines = text.split('\n')
        transactions = []
        current_trans = {}

        for line in lines:
            date_match = self.date_pattern.match(line)

            # CASE 1: New Transaction Line
            if date_match:
                if current_trans: transactions.append(current_trans)

                current_trans = {
                    "Date": date_match.group(1),
                    "Description": line[len(date_match.group(1)):].strip(),
                    "Amount": None,
                    "Balance": None  # Initialize Balance
                }

                # Check for money on this line
                matches = self.money_pattern.findall(line)
                if len(matches) >= 2:
                    current_trans["Amount"] = matches[-2]
                    current_trans["Balance"] = matches[-1]
                    # Clean description
                    desc = current_trans["Description"]
                    desc = desc.replace(matches[-2], "").replace(matches[-1], "")
                    current_trans["Description"] = desc.strip()
                elif len(matches) == 1:
                    # Ambiguous (rare): assume it's amount if uncategorized?
                    # Safer to leave for next lines usually
                    pass

            # CASE 2: Continuation Line
            elif current_trans:
                if self._is_junk(line): continue

                matches = self.money_pattern.findall(line)
                if matches:
                    if len(matches) >= 2:
                        current_trans["Amount"] = matches[-2]
                        current_trans["Balance"] = matches[-1]
                    elif len(matches) == 1:
                        # If we already have Amount, this might be Balance
                        if current_trans["Amount"] is None:
                            current_trans["Amount"] = matches[0]
                        elif current_trans["Balance"] is None:
                            current_trans["Balance"] = matches[0]
                else:
                    current_trans["Description"] += " " + line.strip()

        if current_trans: transactions.append(current_trans)
        return transactions

    def _find_amount(self, trans, line):
        matches = self.money_pattern.findall(line)
        if matches:
            # Usually the second to last money value is the transaction amount (last is balance)
            # If only one exists, it's likely the amount
            val = matches[-2] if len(matches) >= 2 else matches[0]
            trans["Amount"] = val
            # Clean description
            trans["Description"] = trans["Description"].replace(val, "").strip()

    def _is_junk(self, line):
        # Added explicit checks for Opening/Closing balance lines
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

        # 1. Clean Amount
        df['Amount'] = df['Amount'].astype(str).str.replace('£', '').str.replace(',', '')
        df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0.0)

        # 2. Clean Balance (FIX HERE)
        # We need to clean the Balance column just like Amount
        if 'Balance' in df.columns:
            df['Balance'] = df['Balance'].astype(str).str.replace('£', '').str.replace(',', '')
            df['Balance'] = pd.to_numeric(df['Balance'], errors='coerce')
        else:
            # Create dummy column if missing to prevent crashes
            df['Balance'] = 0.0

        # 1. Clean Amount
        df['Amount'] = df['Amount'].astype(str).str.replace('£', '').str.replace(',', '')
        df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0.0)

        df = df[df['Amount'] != 0.0]

        # Parse Dates
        df['Date'] = pd.to_datetime(df['Date'], format='%d %b %Y', errors='coerce')

        # Categorize
        df['Category'] = df['Description'].apply(self._get_category)

        # Filter: Only keep expenses (negative amounts) for budgeting
        # (You might want to flip this logic if you track income, but for budgeting usually we look at costs)
        return df

    def _get_category(self, desc):
        desc = str(desc).strip()

        # 1. CHECK LEARNING FILE (Exact Match)
        # This is for specific vendor names you've manually corrected
        learned_rules = load_learned_rules()
        if desc in learned_rules:
            return learned_rules[desc]

        # 2. FALLBACK TO CONFIG RULES (Keyword Search)
        # This is for your broad rules like "Tesco" matching "Tesco Extra"
        desc_upper = desc.upper()
        for cat, keywords in CATEGORY_RULES.items():
            for k in keywords:
                if k.upper() in desc_upper:
                    return cat

        return "Uncategorized"

class AmexCSVParser:
    """
    Parses American Express CSV exports.
    """

    def parse(self, file_path):
        try:
            # Amex CSVs often don't have headers on the first line if exported certain ways,
            # but your file shows headers: "Date,Description,Card Member,Account #,Amount"
            df = pd.read_csv(file_path)

            # Map columns to our standard schema
            # Amex: Date, Description, Amount
            # We ignore 'Card Member' and 'Account #'

            # 1. Standardize Date
            # Format in file is DD/MM/YYYY (e.g., 10/12/2025)
            df['Date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y', errors='coerce')

            # 2. Standardize Amount (CRITICAL STEP)
            # Amex: Positive = Expense, Negative = Payment
            # Chase/Our App: Negative = Expense, Positive = Income
            # So we must INVERT the Amex amount:  Amount = Amount * -1
            df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce') * -1

            # 3. Create 'Type' column
            df['Type'] = df['Amount'].apply(lambda x: 'Expense' if x < 0 else 'Income')

            # 4. Clean Description
            df['Description'] = df['Description'].str.strip()

            # 5. Categorize (Reuse the same logic as Chase)
            # We need to instantiate the Chase parser just to use its helper,
            # or better yet, make _get_category a standalone function or mixin.
            # For now, let's just create an instance of ChaseParser to use its method.
            chase_parser = ChaseStatementParser()
            df['Category'] = df['Description'].apply(chase_parser._get_category)

            # 6. Add dummy Balance column (Amex CSV doesn't track running balance)
            df['Balance'] = 0.0

            # 7. Select and Reorder columns
            return df[['Date', 'Description', 'Amount', 'Type', 'Category', 'Balance']]

        except Exception as e:
            print(f"Error parsing Amex CSV {file_path}: {e}")
            return pd.DataFrame()

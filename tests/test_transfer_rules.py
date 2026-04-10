from api.transfer_rules import apply_transfer_classification


def test_apply_transfer_classification_marks_transfer_transactions():
    txns = [
        {"description": "AMEX CREDIT CARD PAYMENT", "category": "Uncategorized"},
        {"description": "Tesco Stores", "category": "Food"},
        {"description": "Internal transfer to savings", "category": "Uncategorized"},
    ]

    result = apply_transfer_classification(txns)

    assert result[0]["category"] == "Transfer"
    assert result[1]["category"] == "Food"
    assert result[2]["category"] == "Transfer"

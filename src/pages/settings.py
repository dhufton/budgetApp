# budgetApp/src/pages/settings.py
import streamlit as st
from budgeting.categories import (
    get_user_categories,
    add_category,
    delete_category,
    get_budget_targets,
    set_budget_target
)


def render_settings_page(user_id: str):
    """Settings page for categories and budgets."""
    st.title("⚙️ Settings")

    tab1, tab2 = st.tabs(["📂 Categories", "💰 Budget Targets"])

    # ===== CATEGORIES TAB =====
    with tab1:
        st.markdown("### Your Categories")

        # List current categories
        categories = get_user_categories(user_id)
        if categories:
            st.write("**Current categories:**")
            for cat in sorted(categories):
                col1, col2 = st.columns([4, 1])
                col1.write(f"• {cat}")
                if col2.button("🗑️", key=f"del_{cat}"):
                    delete_category(user_id, cat)
                    st.success(f"Deleted '{cat}'")
                    st.rerun()
        else:
            st.info("No custom categories yet.")

        st.divider()

        # Add new category
        st.markdown("### Add New Category")
        new_cat = st.text_input("Category Name", placeholder="e.g. Entertainment")

        if st.button("➕ Add Category", disabled=not new_cat):
            if new_cat and new_cat not in categories:
                add_category(user_id, new_cat)
                st.success(f"Added '{new_cat}'")
                st.rerun()
            elif new_cat in categories:
                st.warning("Category already exists!")

    # ===== BUDGET TARGETS TAB =====
    with tab2:
        st.markdown("### Monthly Budget Targets")

        categories = get_user_categories(user_id)
        if not categories:
            st.info("Create some categories first!")
            return

        # Load existing targets
        targets_df = get_budget_targets(user_id)
        targets_dict = dict(
            zip(targets_df["category_name"], targets_df["monthly_target"])) if not targets_df.empty else {}

        # Editable budget table
        budget_data = []
        for cat in sorted(categories):
            budget_data.append({
                "Category": cat,
                "Monthly Target (£)": float(targets_dict.get(cat, 0.0))
            })

        if budget:
            edited_df = st.data_editor(
                budget_data,
                use_container_width=True,
                hide_index=True,
                column_config={
                    "Monthly Target (£)": st.column_config.NumberColumn(
                        "Monthly Target (£)",
                        min_value=0.0,
                        format="£%.2f"
                    )
                }
            )

            if st.button("💾 Save Budget Targets", use_container_width=True):
                for _, row in enumerate(edited_df):
                    set_budget_target(user_id, row["Category"], row["Monthly Target (£)"])
                st.success("✅ Budget targets saved!")
                st.cache_data.clear()
                st.rerun()

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { AddCategoryModal } from "@/features/settings/components/AddCategoryModal";
import { useCategoriesQuery } from "@/features/categories/hooks/useCategoriesQuery";
import { api } from "@/lib/api/client";
import {
  dedupeKeywords,
  getErrorMessage,
  keywordListsEqual,
  normalizeKeyword,
} from "@/features/settings/utils";

export function CategoriesSection() {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategoriesQuery();
  const allCategories = categoriesQuery.data?.all_categories ?? [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingKeywords, setPendingKeywords] = useState<Record<string, string[]>>({});
  const [keywordInputs, setKeywordInputs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!allCategories.length) {
      return;
    }

    setPendingKeywords(
      Object.fromEntries(
        allCategories.map((category) => [category.name, [...category.extra_keywords]]),
      ),
    );
    setKeywordInputs({});
  }, [allCategories]);

  const builtInCategories = useMemo(
    () => allCategories.filter((category) => category.is_builtin),
    [allCategories],
  );
  const customCategories = useMemo(
    () => allCategories.filter((category) => !category.is_builtin),
    [allCategories],
  );
  const dirtyCategories = useMemo(
    () =>
      allCategories.filter(
        (category) =>
          !keywordListsEqual(
            category.extra_keywords,
            pendingKeywords[category.name] ?? category.extra_keywords,
          ),
      ),
    [allCategories, pendingKeywords],
  );

  const saveKeywordsMutation = useMutation({
    mutationFn: (updates: Array<{ keywords: string[]; name: string }>) =>
      Promise.all(
        updates.map((update) => api.updateCategoryKeywords(update.name, update.keywords)),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => api.createCustomCategory(name, []),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (name: string) => api.deleteCategory(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  function updateKeywordInput(categoryName: string, value: string) {
    setKeywordInputs((current) => ({
      ...current,
      [categoryName]: value,
    }));
  }

  function addKeyword(categoryName: string) {
    const rawValue = keywordInputs[categoryName] ?? "";
    const nextKeyword = normalizeKeyword(rawValue);
    if (!nextKeyword) {
      return;
    }

    setPendingKeywords((current) => ({
      ...current,
      [categoryName]: dedupeKeywords([...(current[categoryName] ?? []), nextKeyword]),
    }));
    setKeywordInputs((current) => ({
      ...current,
      [categoryName]: "",
    }));
  }

  function removeKeyword(categoryName: string, keyword: string) {
    setPendingKeywords((current) => ({
      ...current,
      [categoryName]: (current[categoryName] ?? []).filter(
        (currentKeyword) => currentKeyword.toLowerCase() !== keyword.toLowerCase(),
      ),
    }));
  }

  async function handleSaveChanges() {
    if (!dirtyCategories.length) {
      setNotice("No keyword changes to save.");
      setErrorMessage(null);
      return;
    }

    try {
      setErrorMessage(null);
      await saveKeywordsMutation.mutateAsync(
        dirtyCategories.map((category) => ({
          keywords: pendingKeywords[category.name] ?? [],
          name: category.name,
        })),
      );
      setNotice(
        `Saved keyword changes for ${dirtyCategories.length} categor${
          dirtyCategories.length === 1 ? "y" : "ies"
        }.`,
      );
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to save keyword changes."));
    }
  }

  async function handleCreateCategory(name: string) {
    try {
      setErrorMessage(null);
      await createCategoryMutation.mutateAsync(name);
      setIsModalOpen(false);
      setNotice(`Created ${name}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to create category."));
      throw error;
    }
  }

  async function handleDeleteCategory(name: string) {
    if (
      !window.confirm(
        `Delete category "${name}"?\n\nTransactions assigned to it will keep their text value, but the category record will be removed.`,
      )
    ) {
      return;
    }

    try {
      setErrorMessage(null);
      await deleteCategoryMutation.mutateAsync(name);
      setNotice(`Deleted ${name}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to delete category."));
    }
  }

  return (
    <div className="settings-section-stack">
      <Card
        actions={
          <div className="settings-toolbar-actions">
            <Button onClick={() => setIsModalOpen(true)} variant="secondary">
              Add category
            </Button>
            <Button
              disabled={saveKeywordsMutation.isPending}
              onClick={() => void handleSaveChanges()}
            >
              {saveKeywordsMutation.isPending ? "Saving..." : "Save keyword changes"}
            </Button>
          </div>
        }
        description="Built-in keywords remain visible, while custom keywords stay editable and save through the existing categories API."
        title="Category keywords"
      >
        <div className="settings-card-stack">
          <p className="supporting-copy">
            Keyword updates still run before the Groq fallback during categorisation,
            so this page preserves the current deterministic-first pipeline.
          </p>

          {notice ? <p className="message message--success">{notice}</p> : null}
          {errorMessage ? <p className="message message--error">{errorMessage}</p> : null}

          {categoriesQuery.isLoading && !allCategories.length ? (
            <LoadingState
              title="Loading categories"
              description="Reading built-in and custom category definitions from the existing API."
            />
          ) : null}

          {categoriesQuery.isError && !allCategories.length ? (
            <EmptyState
              action={
                <Button onClick={() => void categoriesQuery.refetch()} variant="secondary">
                  Retry
                </Button>
              }
              description="The categories endpoint did not return data for this request."
              title={getErrorMessage(categoriesQuery.error, "Failed to load categories.")}
            />
          ) : null}

          {!categoriesQuery.isLoading && !categoriesQuery.isError && !allCategories.length ? (
            <EmptyState
              description="Categories have not been returned yet. Refresh the page and try again."
              title="No categories available"
            />
          ) : null}
        </div>
      </Card>

      {builtInCategories.length ? (
        <Card
          description="Built-in categories keep their shipped keywords, while any extra keywords you add remain editable here."
          title="Built-in categories"
        >
          <div className="settings-category-grid">
            {builtInCategories.map((category) => (
              <article className="settings-category-card" key={category.name}>
                <div className="settings-category-card__header">
                  <div className="settings-item__title-row">
                    <h3 className="settings-item__title">{category.name}</h3>
                    <span className="settings-badge settings-badge--muted">Built-in</span>
                  </div>
                </div>

                <div className="settings-card-stack">
                  <div>
                    <p className="settings-subheading">Built-in keywords</p>
                    <div className="settings-chip-list">
                      {category.builtin_keywords.map((keyword) => (
                        <span
                          className="settings-chip settings-chip--builtin"
                          key={`${category.name}-${keyword}`}
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="settings-subheading">Your extra keywords</p>
                    {(pendingKeywords[category.name] ?? []).length ? (
                      <div className="settings-chip-list">
                        {(pendingKeywords[category.name] ?? []).map((keyword) => (
                          <span
                            className="settings-chip settings-chip--editable"
                            key={`${category.name}-${keyword}`}
                          >
                            <span>{keyword}</span>
                            <button
                              aria-label={`Remove ${keyword}`}
                              className="settings-chip__remove"
                              onClick={() => removeKeyword(category.name, keyword)}
                              type="button"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="settings-empty-copy">No custom keywords yet.</p>
                    )}
                  </div>

                  <div className="settings-inline-form">
                    <Input
                      onChange={(event) =>
                        updateKeywordInput(category.name, event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addKeyword(category.name);
                        }
                      }}
                      placeholder="Add keyword and press Enter"
                      value={keywordInputs[category.name] ?? ""}
                    />
                    <Button onClick={() => addKeyword(category.name)} variant="secondary">
                      Add
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        description="Custom categories stay deletable and use the same keyword-save contract as the existing categories API."
        title="Custom categories"
      >
        {customCategories.length ? (
          <div className="settings-category-grid">
            {customCategories.map((category) => (
              <article className="settings-category-card" key={category.name}>
                <div className="settings-category-card__header">
                  <div className="settings-item__title-row">
                    <h3 className="settings-item__title">{category.name}</h3>
                    <span className="settings-badge settings-badge--accent">Custom</span>
                  </div>

                  <Button
                    disabled={
                      deleteCategoryMutation.isPending &&
                      deleteCategoryMutation.variables === category.name
                    }
                    onClick={() => void handleDeleteCategory(category.name)}
                    variant="danger"
                  >
                    {deleteCategoryMutation.isPending &&
                    deleteCategoryMutation.variables === category.name
                      ? "Deleting..."
                      : "Delete"}
                  </Button>
                </div>

                <div className="settings-card-stack">
                  <div>
                    <p className="settings-subheading">Keywords</p>
                    {(pendingKeywords[category.name] ?? []).length ? (
                      <div className="settings-chip-list">
                        {(pendingKeywords[category.name] ?? []).map((keyword) => (
                          <span
                            className="settings-chip settings-chip--editable"
                            key={`${category.name}-${keyword}`}
                          >
                            <span>{keyword}</span>
                            <button
                              aria-label={`Remove ${keyword}`}
                              className="settings-chip__remove"
                              onClick={() => removeKeyword(category.name, keyword)}
                              type="button"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="settings-empty-copy">
                        Add at least one keyword so uploads can classify this category
                        automatically.
                      </p>
                    )}
                  </div>

                  <div className="settings-inline-form">
                    <Input
                      onChange={(event) =>
                        updateKeywordInput(category.name, event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addKeyword(category.name);
                        }
                      }}
                      placeholder="Add keyword and press Enter"
                      value={keywordInputs[category.name] ?? ""}
                    />
                    <Button onClick={() => addKeyword(category.name)} variant="secondary">
                      Add
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Create a custom category when the built-in set does not match your spending patterns."
            title="No custom categories yet"
          />
        )}
      </Card>

      <AddCategoryModal
        errorMessage={
          createCategoryMutation.isError
            ? getErrorMessage(createCategoryMutation.error, "Failed to create category.")
            : null
        }
        existingNames={allCategories.map((category) => category.name)}
        isOpen={isModalOpen}
        isPending={createCategoryMutation.isPending}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateCategory}
      />
    </div>
  );
}

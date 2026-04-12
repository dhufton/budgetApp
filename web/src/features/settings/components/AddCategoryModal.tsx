import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

type AddCategoryModalProps = {
  existingNames: string[];
  isOpen: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
};

export function AddCategoryModal({
  errorMessage,
  existingNames,
  isOpen,
  isPending,
  onClose,
  onCreate,
}: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setName("");
    setLocalError(null);
  }, [isOpen]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError("Category name is required.");
      return;
    }

    if (
      existingNames.some(
        (existingName) => existingName.toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      setLocalError(`Category "${trimmedName}" already exists.`);
      return;
    }

    try {
      setLocalError(null);
      await onCreate(trimmedName);
    } catch {
      return;
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="secondary">
        Cancel
      </Button>
      <Button disabled={isPending} onClick={() => void handleSubmit()}>
        {isPending ? "Creating..." : "Create category"}
      </Button>
    </>
  );

  return (
    <Modal
      description="Create a custom category and then add matching keywords so uploads can classify it automatically."
      footer={footer}
      isOpen={isOpen}
      onClose={onClose}
      title="Add custom category"
    >
      <div className="settings-modal-form">
        <label className="field">
          <span className="field__label">Category name</span>
          <Input
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Health, Golf, Hobbies"
            value={name}
          />
        </label>

        {localError ? <p className="message message--error">{localError}</p> : null}
        {!localError && errorMessage ? (
          <p className="message message--error">{errorMessage}</p>
        ) : null}
      </div>
    </Modal>
  );
}

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import type { Account } from "@/lib/api/types";

type UploadPanelProps = {
  accounts: Account[];
  isUploading: boolean;
  message?: {
    tone: "error" | "success";
    text: string;
  } | null;
  uploadAccountId: string;
  onUpload: (files: File[], accountId: string) => Promise<void>;
  onUploadAccountChange: (accountId: string) => void;
};

export function UploadPanel({
  accounts,
  isUploading,
  message,
  uploadAccountId,
  onUpload,
  onUploadAccountChange,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const helperText = useMemo(() => {
    if (!selectedFiles.length) {
      return "Upload PDF or CSV bank statements. Successful uploads automatically trigger categorisation and recurring-rule recomputation through the React workflow.";
    }

    return `${selectedFiles.length} file${
      selectedFiles.length === 1 ? "" : "s"
    } selected: ${selectedFiles.map((file) => file.name).join(", ")}`;
  }, [selectedFiles]);

  async function handleUpload() {
    if (!selectedFiles.length || !uploadAccountId) {
      return;
    }

    await onUpload(selectedFiles, uploadAccountId);
    setSelectedFiles([]);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <Card
      actions={
        <Button
          disabled={!selectedFiles.length || !uploadAccountId || isUploading}
          onClick={() => {
            void handleUpload();
          }}
        >
          {isUploading ? "Uploading…" : "Upload statements"}
        </Button>
      }
      description="Statement ingestion stays backend-driven. This panel only swaps the legacy DOM workflow for the shared React query/mutation layer."
      title="Upload"
    >
      <div className="dashboard-upload-panel">
        <div className="field">
          <label className="field__label" htmlFor="dashboard-upload-account">
            Upload account
          </label>
          <Select
            id="dashboard-upload-account"
            onChange={(event) => onUploadAccountChange(event.target.value)}
            value={uploadAccountId}
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="dashboard-file-upload">
            Files
          </label>
          <input
            accept=".csv,.pdf"
            className="input dashboard-upload-panel__file-input"
            id="dashboard-file-upload"
            multiple
            onChange={(event) =>
              setSelectedFiles(Array.from(event.target.files ?? []))
            }
            ref={inputRef}
            type="file"
          />
          <p className="dashboard-upload-panel__helper">{helperText}</p>
        </div>

        {message ? (
          <p className={`message message--${message.tone}`}>{message.text}</p>
        ) : null}
      </div>
    </Card>
  );
}

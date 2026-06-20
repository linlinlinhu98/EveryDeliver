import { useCallback, useState, DragEvent, ChangeEvent } from "react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
}

/**
 * Drag-and-drop file upload component.
 * Supports PDF, Word (.docx), and plain text files.
 */
export default function FileUpload({
  onFileSelect,
  accept = ".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  maxSizeMB = 10,
}: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const validateAndSelect = useCallback(
    (file: File) => {
      setError("");

      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        setError(`文件过大，最大支持 ${maxSizeMB}MB`);
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "docx", "txt"].includes(ext)) {
        setError("仅支持 PDF、Word (.docx)、纯文本 (.txt) 格式");
        return;
      }

      onFileSelect(file);
    },
    [onFileSelect, maxSizeMB]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect]
  );

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSelect(file);
  };

  return (
    <div className="file-upload-wrapper">
      <div
        className={`file-upload-zone ${dragging ? "dragging" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById("fileInput")?.click()}
      >
        <div className="upload-icon">📄</div>
        <p className="upload-text">拖拽简历文件到此处，或点击选择</p>
        <p className="upload-hint">支持 PDF、Word (.docx)、纯文本 (.txt)，最大 {maxSizeMB}MB</p>
        <input
          id="fileInput"
          type="file"
          accept={accept}
          onChange={handleChange}
          style={{ display: "none" }}
        />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}

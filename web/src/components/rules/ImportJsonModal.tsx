import { Alert, Button, Input, Modal, Radio, Space, Typography, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useState } from "react";
import {
  RULE_MODULE_LABEL,
  RuleModuleType,
  parseRuleJsonText,
  type ValidationIssue,
} from "../../types";

export type ImportMode = "replace" | "merge";

interface ImportJsonModalProps {
  open: boolean;
  module: RuleModuleType;
  onCancel: () => void;
  onImport: (file: unknown, mode: ImportMode, warnings: ValidationIssue[]) => void | Promise<void>;
}

function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.path ? `${i.path}: ` : ""}${i.message}`).join("\n");
}

export function ImportJsonModal({ open, module, onCancel, onImport }: ImportJsonModalProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("replace");
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setText("");
    setMode("replace");
    setErrors([]);
    setWarnings([]);
  };

  const handleValidate = () => {
    const result = parseRuleJsonText(text, module);
    if (!result.ok) {
      setErrors(result.errors);
      setWarnings(result.warnings);
      return null;
    }
    setErrors([]);
    setWarnings(result.warnings);
    return result;
  };

  const handleOk = async () => {
    const result = handleValidate();
    if (!result || !result.ok) return;
    setSubmitting(true);
    try {
      await onImport(result.file, mode, result.warnings);
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`导入 JSON · ${RULE_MODULE_LABEL[module]}`}
      open={open}
      onCancel={() => {
        reset();
        onCancel();
      }}
      onOk={() => void handleOk()}
      okText="确认导入"
      confirmLoading={submitting}
      okButtonProps={{ disabled: !text.trim() }}
      width={640}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          将导入到当前模块「{RULE_MODULE_LABEL[module]}」。文件需包含{" "}
          <code>type: &quot;{module}&quot;</code>（旧文件无 type 时按当前模块兼容）。
        </Typography.Paragraph>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio value="replace">替换当前规则</Radio>
          <Radio value="merge">合并到现有规则</Radio>
        </Radio.Group>
        <Space>
          <Upload
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              void file.text().then((content) => {
                setText(content);
                setErrors([]);
                setWarnings([]);
              });
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              handleValidate();
            }}
          >
            校验
          </Button>
        </Space>
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder='粘贴规则 JSON，例如 { "version": 3, "type": "whitelist", "rules": [...] }'
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
        />
        {errors.length > 0 && (
          <Alert
            type="error"
            showIcon
            message="校验失败"
            description={<pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{formatIssues(errors)}</pre>}
          />
        )}
        {warnings.length > 0 && errors.length === 0 && (
          <Alert
            type="warning"
            showIcon
            message="校验通过（有警告）"
            description={
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{formatIssues(warnings)}</pre>
            }
          />
        )}
      </Space>
    </Modal>
  );
}

export function downloadRuleJson(filename: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

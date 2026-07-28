import { Button, Drawer } from "antd";
import { ScanConfigForm, type ScanConfigFormProps } from "./ScanConfigForm";

interface ScanConfigDrawerProps extends ScanConfigFormProps {
  open: boolean;
  onClose: () => void;
  saving?: boolean;
  onSave: () => void;
}

export function ScanConfigDrawer({ open, onClose, saving, onSave, ...formProps }: ScanConfigDrawerProps) {
  return (
    <Drawer
      title="扫描配置"
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
      extra={
        <Button type="primary" loading={saving} onClick={onSave}>
          保存
        </Button>
      }
    >
      <ScanConfigForm {...formProps} />
    </Drawer>
  );
}

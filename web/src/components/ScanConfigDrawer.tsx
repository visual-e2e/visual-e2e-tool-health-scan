import { Drawer } from "antd";
import { ScanConfigForm, type ScanConfigFormProps } from "./ScanConfigForm";

interface ScanConfigDrawerProps extends ScanConfigFormProps {
  open: boolean;
  onClose: () => void;
}

export function ScanConfigDrawer({ open, onClose, ...formProps }: ScanConfigDrawerProps) {
  return (
    <Drawer
      title="扫描配置"
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
    >
      <ScanConfigForm {...formProps} />
    </Drawer>
  );
}

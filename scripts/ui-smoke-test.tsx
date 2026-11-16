/**
 * UI 原语渲染冒烟测试
 *
 * 用 react-dom/server 把抽出来的弹窗渲染成字符串，验证：
 * 1. 组件能正常渲染（hooks 顺序、props 契约、cloneElement 不报错）
 * 2. 关键结构仍在（标题、按钮文案、开关的 aria-checked）
 * 3. 没有残留的旧外壳（多余的 fixed inset-0 叠加）
 *
 * 运行：npm run test:ui
 *
 * 注：脚本用 JSX 编写，由 esbuild 先行打包为 CJS 再执行（见 package.json 的 test:ui）。
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import ConfirmModal from '../src/renderer/components/common/ConfirmModal';
import ConsoleRenameModal from '../src/renderer/components/console/ConsoleRenameModal';
import RenameTableModal from '../src/renderer/components/table/RenameTableModal';
import SchemaFilterModal from '../src/renderer/components/table/SchemaFilterModal';
import Switch from '../src/renderer/ui/Switch';
import Button from '../src/renderer/ui/Button';
import Field from '../src/renderer/ui/Field';
import Modal from '../src/renderer/ui/Modal';
import Select from '../src/renderer/ui/Select';

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

function render(element) {
  return renderToString(element);
}

console.log('UI 原语渲染测试');

try {
  const confirm = render(
    React.createElement(ConfirmModal, {
      show: true,
      title: '删除数据表',
      message: '该操作不可撤销',
      type: 'danger',
      onCancel: () => {},
      onConfirm: () => {},
    })
  );
  check('ConfirmModal 渲染标题', confirm.includes('删除数据表'));
  check('ConfirmModal 渲染默认按钮', confirm.includes('取消') && confirm.includes('确定'));
  check('ConfirmModal 带 dialog 语义', confirm.includes('role="dialog"') && confirm.includes('aria-modal="true"'));
  check('ConfirmModal 遮罩只出现一次', (confirm.match(/fixed inset-0/g) || []).length === 1);

  const custom = render(
    React.createElement(ConfirmModal, {
      show: true,
      title: '选择',
      message: '请选择',
      buttons: [
        { label: '保留', onClick: () => {}, variant: 'secondary' },
        { label: '覆盖', onClick: () => {}, variant: 'primary' },
      ],
      onCancel: () => {},
    })
  );
  check('ConfirmModal 自定义按钮渲染', custom.includes('保留') && custom.includes('覆盖'));

  const hidden = render(
    React.createElement(ConfirmModal, { show: false, title: 'x', message: 'y', onCancel: () => {} })
  );
  check('ConfirmModal show=false 时输出空', hidden === '');

  const rename = render(
    React.createElement(ConsoleRenameModal, {
      data: { id: 'c1', name: '我的控制台' },
      onClose: () => {},
      onChange: () => {},
      onSave: () => {},
    })
  );
  check('ConsoleRenameModal 渲染名称', rename.includes('我的控制台'));
  check('ConsoleRenameModal label 与输入框关联', /<label for="[^"]+"/.test(rename) && rename.includes('<input'));

  const renameTable = render(
    React.createElement(RenameTableModal, {
      data: { oldName: 'old_t', newName: 'new_t' },
      onChange: () => {},
      onClose: () => {},
      onRename: () => {},
    })
  );
  check('RenameTableModal 渲染新旧名称', renameTable.includes('old_t') && renameTable.includes('new_t'));

  const filter = render(
    React.createElement(SchemaFilterModal, {
      connectionName: 'prod-mysql',
      databases: ['db_a', 'db_b'],
      draft: ['db_a'],
      onDraftChange: () => {},
      onClose: () => {},
      onSave: () => {},
    })
  );
  // SSR 会在文本插值之间插入注释节点，不能整串匹配
  check('SchemaFilterModal 渲染连接名与计数', filter.includes('prod-mysql') && filter.includes('已选'));
  check('SchemaFilterModal 复选项状态正确', (filter.match(/checked=""/g) || []).length === 1);

  const switchOff = render(React.createElement(Switch, { checked: false, onChange: () => {}, label: '测试开关' }));
  check('Switch 关闭态 aria-checked=false', switchOff.includes('aria-checked="false"') && switchOff.includes('role="switch"'));

  const switchOn = render(React.createElement(Switch, { checked: true, onChange: () => {}, label: '测试开关', tone: 'amber' }));
  check('Switch 开启态使用 amber 色', switchOn.includes('aria-checked="true"') && switchOn.includes('bg-amber-500'));

  const btn = render(React.createElement(Button, { variant: 'primary', size: 'lg' }, '保存'));
  check('Button 渲染文案与主色', btn.includes('保存') && btn.includes('bg-indigo-600'));

  const btnLoading = render(React.createElement(Button, { loading: true }, '提交'));
  check('Button 加载态禁用', btnLoading.includes('disabled'));

  const field = render(
    React.createElement(Field, { label: '用户名', hint: '必填' }, (id) =>
      React.createElement('input', { id })
    )
  );
  check('Field 渲染标题与说明', field.includes('用户名') && field.includes('必填'));
  check('Field 把 id 传给控件', /<label for="([^"]+)"/.test(field) && field.includes('<input id="'));

  const bare = render(React.createElement(Modal, { onClose: () => {}, ariaLabel: '裸弹窗' }, '内容'));
  check('Modal 基础渲染', bare.includes('裸弹窗') && bare.includes('内容'));

  const selectIdle = render(
    React.createElement(Select, {
      value: '',
      onChange: () => {},
      options: [
        { value: 'a', label: '选项 A' },
        { value: 'b', label: '选项 B' },
      ],
      placeholder: '请选择数据库',
      ariaLabel: '数据库',
    })
  );
  check('Select 空值显示占位文案', selectIdle.includes('请选择数据库'));
  check('Select 渲染 combobox 语义', selectIdle.includes('role="combobox"') && selectIdle.includes('aria-expanded="false"'));
  check('Select 未展开时不渲染面板', !selectIdle.includes('role="listbox"'));

  const selectActive = render(
    React.createElement(Select, {
      value: 'b',
      onChange: () => {},
      options: [
        { value: 'a', label: '选项 A' },
        { value: 'b', label: '选项 B' },
      ],
      placeholder: '请选择',
      ariaLabel: '测试',
    })
  );
  check('Select 选中态显示 label', selectActive.includes('选项 B') && !selectActive.includes('请选择'));

  const selectDisabled = render(
    React.createElement(Select, { value: 'a', onChange: () => {}, options: [{ value: 'a', label: 'A' }], disabled: true })
  );
  check('Select disabled 生效', selectDisabled.includes('disabled'));
} catch (error) {
  failures.push(`异常：${error.message}`);
  console.log(`  FAIL 渲染过程抛错 — ${error.stack || error.message}`);
}

console.log('');
if (failures.length === 0) {
  console.log('全部通过');
  process.exit(0);
} else {
  console.log(`失败 ${failures.length} 项：${failures.join('、')}`);
  process.exit(1);
}

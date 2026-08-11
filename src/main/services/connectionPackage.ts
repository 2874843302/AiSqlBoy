/**
 * 只读连接包：加密导出 / 解密导入
 * - AES-256-GCM 加密（口令经 PBKDF2 派生密钥），GCM 认证标签保证包体不可篡改
 * - 导出时强制 readOnly: true；导入时强制 readOnly + locked，防止本地改为可写
 */

import crypto from 'crypto';
import type { ConnectionConfig } from '../../shared/types';

const PKG_KIND = 'aisqlboy-readonly-package';
const PKG_VERSION = 1;
const PBKDF2_ITERATIONS = 100000;

interface PackagePayload {
  kind: string;
  v: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

/** 将连接配置加密为连接包文本（强制只读 + 有效期）；expiresAt 在密文内，无法被篡改延长 */
export function encryptConnectionPackage(config: ConnectionConfig, passphrase: string, expiresAt: number): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // 包内配置强制只读并写入有效期，忽略导出方本地的 readOnly/expiresAt 值
  const plaintext = JSON.stringify({ ...config, readOnly: true, expiresAt });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const payload: PackagePayload = {
    kind: PKG_KIND,
    v: PKG_VERSION,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
  return JSON.stringify(payload);
}

/** 解密连接包，失败（口令错误或包被篡改）时抛异常；解密结果强制只读且锁定 */
export function decryptConnectionPackage(raw: string, passphrase: string): ConnectionConfig {
  let payload: PackagePayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('连接包格式无效');
  }
  if (!payload || payload.kind !== PKG_KIND || payload.v !== PKG_VERSION) {
    throw new Error('连接包格式无效');
  }

  const key = crypto.pbkdf2Sync(passphrase, Buffer.from(payload.salt, 'base64'), PBKDF2_ITERATIONS, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  let decrypted: string;
  try {
    decrypted = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('口令错误或连接包已被篡改');
  }

  const config = JSON.parse(decrypted) as ConnectionConfig;
  // 有效期校验：缺失或已过期均拒绝导入
  if (!config.expiresAt || typeof config.expiresAt !== 'number') {
    throw new Error('连接包格式无效：缺少有效期信息');
  }
  if (Date.now() > config.expiresAt) {
    throw new Error(`连接包已于 ${new Date(config.expiresAt).toLocaleString('zh-CN')} 过期，请联系分享者重新导出`);
  }
  // 导入侧强制只读 + 锁定：即使包体被伪造也不允许提权；expiresAt 随包体保留，到期后连接不可用
  return { ...config, readOnly: true, locked: true };
}

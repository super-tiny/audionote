export function directionalIcon<T extends string>(icon: T, isRtl: boolean): T {
  if (!isRtl) {
    return icon;
  }
  if (icon === 'chevron-back') {
    return 'chevron-forward' as T;
  }
  if (icon === 'chevron-forward') {
    return 'chevron-back' as T;
  }
  return icon;
}

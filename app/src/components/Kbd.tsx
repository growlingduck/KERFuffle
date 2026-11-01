import styles from './Kbd.module.css';

/** A keycap. Pass one key; render several side by side for a combo. */
export function Kbd({ children }: { children: string }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/** A combo as keycaps, e.g. ['Ctrl', 'Shift', 'Z']. */
export function KeyCombo({ keys }: { keys: readonly string[] }) {
  return (
    <span className={styles.combo}>
      {keys.map((key, i) => (
        <Kbd key={`${key}-${i}`}>{key}</Kbd>
      ))}
    </span>
  );
}

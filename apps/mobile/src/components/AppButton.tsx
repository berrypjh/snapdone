import { Pressable, StyleSheet, Text } from 'react-native';

import type { PressableProps } from 'react-native';

import { color, minTouchTarget, radius, space, typography } from '../theme/tokens';

type AppButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary';
};

export const AppButton = ({ label, variant = 'primary', disabled, ...props }: AppButtonProps) => {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled === true;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        pressed && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
        isDisabled && styles.disabled,
      ]}
      {...props}
    >
      <Text style={[styles.label, isPrimary ? styles.labelOnPrimary : styles.labelOnSurface]}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: color.primary,
  },
  primaryPressed: {
    backgroundColor: color.primaryPressed,
  },
  secondary: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  secondaryPressed: {
    backgroundColor: color.surfaceMuted,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...typography.button,
  },
  labelOnPrimary: {
    color: color.onPrimary,
  },
  labelOnSurface: {
    color: color.textPrimary,
  },
});

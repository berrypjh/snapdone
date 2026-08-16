import type { ViewProps } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { color, radius, space } from '../theme/tokens';

type SurfaceProps = ViewProps & {
  /** Recessed background for secondary content. */
  muted?: boolean;
};

/** A bordered content block. The only card treatment in the mobile app. */
export const Surface = ({ muted = false, style, ...props }: SurfaceProps) => (
  <View
    style={[styles.base, muted ? styles.muted : styles.plain, style]}
    {...props}
  />
);

const styles = StyleSheet.create({
  base: {
    padding: space[5],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  plain: {
    backgroundColor: color.surface,
  },
  muted: {
    backgroundColor: color.surfaceMuted,
  },
});

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ShareIntentProvider } from "expo-share-intent";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <ShareIntentProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg.base },
          }}
        />
      </ShareIntentProvider>
    </KeyboardProvider>
  );
}

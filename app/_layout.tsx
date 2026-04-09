import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ShareIntentProvider } from "expo-share-intent";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { colors } from "@/theme";

export default function RootLayout() {
  useQuickActionRouting();

  useEffect(() => {
    QuickActions.setItems([
      {
        id: "voice",
        title: "Voice Capture",
        icon: "symbol:mic.fill",
        params: { href: "/?action=voice" },
      },
      {
        id: "paste",
        title: "Paste Capture",
        icon: "symbol:doc.on.clipboard",
        params: { href: "/?action=paste" },
      },
    ]);
  }, []);

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

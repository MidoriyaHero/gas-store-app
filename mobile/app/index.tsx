import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { resolveSessionRoute, sessionHref } from "@/auth/bootstrap";
import { colors } from "@/theme/tokens";

/** Entry: restore session from SecureStore or send to login. */
export default function Index() {
  const [route, setRoute] = useState<Awaited<ReturnType<typeof resolveSessionRoute>> | null>(null);

  useEffect(() => {
    void resolveSessionRoute()
      .then(setRoute)
      .catch(() => setRoute("/login"));
  }, []);

  if (!route) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={sessionHref(route)} />;
}

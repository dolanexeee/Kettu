import { CardWrapper } from "@core/ui/components/AddonCard";
import { VdThemeInfo, selectTheme, themes } from "@lib/addons/themes";
import { Pressable, Text } from "react-native";

// ROUND 19 (Discord 353): bare row — ThemeCard (Card/Stack/Text/
// FormRadio/IconButton) never commits once a theme is installed
// (diag-10: ADDONPAGE RESULTS n=1, no mount). Same tap behaviour as
// the card's radio toggle: tap selects the theme, tap again deselects.
// The info action (ThemeInfoActionSheet) is deferred with the card.
export default function ThemeBareRow({ item: theme }: CardWrapper<VdThemeInfo>) {
    const selected = themes[theme.id].selected;
    const authors = theme.data.authors;

    return (
        <Pressable
            onPress={() => {
                try {
                    selectTheme(!selected ? theme : null);
                } catch (e: any) {
                    console.error("Error while selecting theme:", e);
                }
            }}
            style={{ paddingVertical: 10, paddingHorizontal: 4, gap: 2 }}
        >
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>
                {theme.data.name}
            </Text>
            {authors ? (
                <Text style={{ color: "#B5BAC1", fontSize: 13 }}>
                    by {authors.map((i) => i.name).join(", ")}
                </Text>
            ) : null}
            {theme.data.description ? (
                <Text style={{ color: "#DBDEE1", fontSize: 13 }}>
                    {theme.data.description}
                </Text>
            ) : null}
            <Text style={{ color: selected ? "#4ADE80" : "#B5BAC1", fontSize: 13, fontWeight: "600" }}>
                {selected ? "Selected — tap to deselect" : "Tap to apply"}
            </Text>
        </Pressable>
    );
}

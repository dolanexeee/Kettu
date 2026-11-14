import { Strings } from "@core/i18n";
import { CardWrapper } from "@core/ui/components/AddonCard";
import { showConfirmationAlert } from "@core/vendetta/alerts";
import { FontDefinition, fonts, selectFont } from "@lib/addons/fonts";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { Pressable, Text } from "react-native";

// ROUND 19 (Discord 353): bare row — FontCard (Card/Stack/Text/
// IconButton/Button) would loop the same way once a font is installed
// (same AddonPage, same card family as ThemeCard — diag-10 proved the
// pattern for Themes). Same tap behaviour as the card's Apply button:
// apply/unapply, then the reload prompt (Discord's own native alert).
// The edit action (FontEditor) is deferred with the card.
export default function FontBareRow({ item: font }: CardWrapper<FontDefinition>) {
    const selected = fonts.__selected === font.name;

    return (
        <Pressable
            onPress={async () => {
                await selectFont(selected ? null : font.name);
                showConfirmationAlert({
                    title: Strings.HOLD_UP,
                    content: "Reload Discord to apply changes?",
                    confirmText: Strings.RELOAD,
                    cancelText: Strings.CANCEL,
                    confirmColor: "red",
                    onConfirm: BundleUpdaterManager.reload
                });
            }}
            style={{ paddingVertical: 10, paddingHorizontal: 4, gap: 2 }}
        >
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>
                {font.name}
            </Text>
            {font.description ? (
                <Text style={{ color: "#DBDEE1", fontSize: 13 }}>
                    {font.description}
                </Text>
            ) : null}
            <Text style={{ color: selected ? "#4ADE80" : "#B5BAC1", fontSize: 13, fontWeight: "600" }}>
                {selected ? "Applied — tap to unapply" : "Tap to apply"}
            </Text>
        </Pressable>
    );
}

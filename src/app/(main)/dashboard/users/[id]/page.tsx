"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import type { EquipmentItem, UserProfile, WithId } from "@/lib/firestore/types";
import { getUserProfile, updateUserProfile } from "@/lib/firestore/users";

type EquipmentSlotKey = "blade" | "forehand" | "backhand";

type EquipmentSlotDraft = {
  enabled: boolean;
  label: string;
};

const SLOT_LABELS: Record<EquipmentSlotKey, string> = {
  blade: "Lemn",
  forehand: "Forehand",
  backhand: "Rever",
};

const toDraft = (value: EquipmentItem | null | undefined): EquipmentSlotDraft => {
  if (!value) {
    return { enabled: false, label: "" };
  }
  return {
    enabled: true,
    label: value.label ?? "",
  };
};

const toPersistedSlot = (draft: EquipmentSlotDraft): EquipmentItem | null => {
  if (!draft.enabled) return null;
  const label = draft.label.trim();
  if (!label) return null;
  return {
    source: "custom",
    catalogId: "",
    label,
  };
};

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;

  const [user, setUser] = useState<WithId<UserProfile> | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [blade, setBlade] = useState<EquipmentSlotDraft>(toDraft(null));
  const [forehand, setForehand] = useState<EquipmentSlotDraft>(toDraft(null));
  const [backhand, setBackhand] = useState<EquipmentSlotDraft>(toDraft(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const profile = await getUserProfile(userId);
        if (!profile) {
          setError("Utilizatorul nu există.");
          setUser(null);
          return;
        }
        setUser(profile);
        setFirstName(profile.firstName ?? "");
        setLastName(profile.lastName ?? "");
        setDisplayName(profile.displayName ?? "");
        setEmail(profile.email ?? "");
        setPhone(profile.phone ?? "");
        setAvatarUrl(profile.avatarUrl ?? "");
        setLanguage(profile.language ?? "");
        setBlade(toDraft(profile.equipment?.blade));
        setForehand(toDraft(profile.equipment?.forehand));
        setBackhand(toDraft(profile.equipment?.backhand));
      } catch (err) {
        logFirebaseError("Users: detailLoad", err);
        const info = getFirebaseErrorInfo(err);
        setError(info.message || "Nu pot încărca utilizatorul.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [userId]);

  const updateSlot = (slot: EquipmentSlotKey, patch: Partial<EquipmentSlotDraft>) => {
    const updater = (current: EquipmentSlotDraft) => ({ ...current, ...patch });
    if (slot === "blade") setBlade((prev) => updater(prev));
    if (slot === "forehand") setForehand((prev) => updater(prev));
    if (slot === "backhand") setBackhand((prev) => updater(prev));
  };

  const slotValue = (slot: EquipmentSlotKey): EquipmentSlotDraft => {
    if (slot === "blade") return blade;
    if (slot === "forehand") return forehand;
    return backhand;
  };

  const handleSave = async () => {
    if (!userId) return;
    try {
      setError(null);
      setSuccess(null);
      setIsSaving(true);
      await updateUserProfile(userId, {
        firstName: firstName.trim() || "",
        lastName: lastName.trim() || "",
        displayName: displayName.trim() || "",
        email: email.trim() || "",
        phone: phone.trim() || "",
        avatarUrl: avatarUrl.trim() || "",
        language: language.trim() || "",
        equipment: {
          blade: toPersistedSlot(blade),
          forehand: toPersistedSlot(forehand),
          backhand: toPersistedSlot(backhand),
        },
      });
      setSuccess("Profilul a fost salvat.");
    } catch (err) {
      logFirebaseError("Users: saveProfile", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Salvarea profilului a eșuat.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0">
            <Link prefetch={false} href="/dashboard/users">
              <ArrowLeft className="mr-2 size-4" />
              Înapoi la utilizatori
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl">Profil utilizator</h1>
          <p className="text-muted-foreground text-sm">{user?.id ?? userId}</p>
        </div>
        <PageHelpDialog helpKey="users" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date profil</CardTitle>
          <CardDescription>Nume, prenume, display name și poză profil (avatarUrl).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="text-destructive text-sm">{error}</div> : null}
          {success ? <div className="text-emerald-600 text-sm">{success}</div> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">Prenume</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Nume</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar-url">Avatar URL</Label>
              <Input
                id="avatar-url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Limbă</Label>
              <Input
                id="language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={isLoading}
                placeholder="ex: ro / en"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Echipament</CardTitle>
          <CardDescription>Configurează Lemn / Forehand / Rever (catalog sau custom).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(["blade", "forehand", "backhand"] as EquipmentSlotKey[]).map((slot) => {
            const value = slotValue(slot);
            return (
              <div key={slot} className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{SLOT_LABELS[slot]}</div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`enabled-${slot}`}>Setat</Label>
                    <Switch
                      id={`enabled-${slot}`}
                      checked={value.enabled}
                      disabled={isLoading}
                      onCheckedChange={(checked) => updateSlot(slot, { enabled: checked })}
                    />
                  </div>
                </div>

                {value.enabled ? (
                  <div className="space-y-2">
                    <Label>Valoare introdusă de utilizator</Label>
                    <Input
                      value={value.label}
                      disabled={isLoading}
                      onChange={(event) => updateSlot(slot, { label: event.target.value })}
                      placeholder={`Ex: setup ${SLOT_LABELS[slot].toLowerCase()}`}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}

          <Separator />
          <div className="flex items-center gap-2">
            <Button type="button" onClick={handleSave} disabled={isLoading || isSaving}>
              {isSaving ? "Se salvează..." : "Salvează profil"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
              disabled={isLoading || isSaving}
            >
              Reîncarcă
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

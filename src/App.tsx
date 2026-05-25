import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Hex } from "@arkiv-network/sdk";

import {
  BRAGA_EXPLORER_URL,
  BRAGA_RPC_URL,
  ENTITY_EXPIRES_IN_DAYS,
  PROJECT_ATTRIBUTE_KEY,
  PROJECT_ATTRIBUTE_VALUE,
  type ArkivEntityDraft,
  type MemoryProfilePayload,
  buildMemoryRecordQuery,
} from "./lib/arkiv/contract";
import {
  MemoryProfileValidationError,
  createMemoryProfileDraftFromInput,
  type MemoryProfile,
  type MemoryProfileFieldErrors,
  type MemoryProfileFormInput,
  type MemoryProfileRepository,
} from "./lib/arkiv/profiles";
import {
  decryptMemoryRecordBody,
  getMemoryRecordBodyPreview,
  isEncryptedMemoryRecord,
  MemoryRecordValidationError,
  type MemoryRecord,
  type MemoryRecordFieldErrors,
  type MemoryRecordFormInput,
  type MemoryRecordRepository,
} from "./lib/arkiv/records";
import {
  createBrowserMemoryProfileRepository,
  createBrowserMemoryRecordRepository,
  diagnoseCreateEntityDraft,
  ensureBragaWalletNetwork,
  type ArkivMutationDiagnosticsResult,
} from "./lib/arkiv/wallet";

type WalletState =
  | { status: "idle"; address: null; message: string }
  | { status: "connected"; address: string; message: string }
  | { status: "error"; address: null; message: string };

type LoadState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type CreateState =
  | { status: "idle"; message: string }
  | { status: "submitting"; message: string }
  | { status: "pending"; message: string }
  | { status: "success"; entityKey: string; message: string; txHash: string }
  | { status: "error"; message: string };

type ProfileDetailState =
  | { status: "idle"; message: string; profile: null }
  | { status: "loading"; message: string; profile: null }
  | { status: "success"; message: string; profile: MemoryProfile }
  | { status: "error"; message: string; profile: null };

type RecordDetailState =
  | { status: "idle"; message: string; record: null }
  | { status: "loading"; message: string; record: null }
  | { status: "success"; message: string; record: MemoryRecord }
  | { status: "error"; message: string; record: null };

type ActiveInspector = "profile" | "record" | null;
type MemoryCaptureMethod = "typed-manually" | "chat" | "docs-web" | "imported" | "other";

type DiagnosticsState =
  | { status: "idle"; message: string; result: null }
  | { status: "loading"; message: string; result: null }
  | { status: "success"; message: string; result: ArkivMutationDiagnosticsResult }
  | { status: "error"; message: string; result: null };

export interface AppProps {
  createProfileRepository?: (provider: EthereumProvider, ownerAddress: string) => MemoryProfileRepository;
  createRecordRepository?: (provider: EthereumProvider, ownerAddress: string) => MemoryRecordRepository;
  decryptRecordBody?: (record: MemoryRecord, passphrase: string) => Promise<string>;
  runProfileCreateDiagnostics?: (
    provider: EthereumProvider,
    ownerAddress: string,
    draft: ArkivEntityDraft<MemoryProfilePayload>,
  ) => Promise<ArkivMutationDiagnosticsResult>;
}

const emptyProfileForm: MemoryProfileFormInput = {
  agentPurpose: "",
  displayName: "",
  notes: "",
};

const emptyMemoryForm: MemoryRecordFormInput = {
  body: "",
  encryptionEnabled: false,
  encryptionPassphrase: "",
  importance: "medium",
  publicTestnetAcknowledged: false,
  source: "typed-manually",
  tags: "",
  title: "",
};

const OTHER_CAPTURE_METHOD = "other" as const;

export function App({
  createProfileRepository = createBrowserMemoryProfileRepository,
  createRecordRepository = createBrowserMemoryRecordRepository,
  decryptRecordBody = decryptMemoryRecordBody,
  runProfileCreateDiagnostics = (provider, ownerAddress, draft) =>
    diagnoseCreateEntityDraft({ draft, ownerAddress, provider }),
}: AppProps) {
  const [wallet, setWallet] = useState<WalletState>({
    status: "idle",
    address: null,
    message: "Connect with Metamask to scope Arkiv profiles and records to your owner address.",
  });
  const [profiles, setProfiles] = useState<MemoryProfile[]>([]);
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState("");
  const [selectedRecordKey, setSelectedRecordKey] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [appliedTagFilter, setAppliedTagFilter] = useState("");
  const [profileLoad, setProfileLoad] = useState<LoadState>({
    status: "idle",
    message: "Connect a wallet to query memory profiles.",
  });
  const [recordLoad, setRecordLoad] = useState<LoadState>({
    status: "idle",
    message: "Select a profile to query memory records.",
  });
  const [profileCreate, setProfileCreate] = useState<CreateState>({
    status: "idle",
    message: "Profile writes require a connected MetaMask account on Arkiv Braga.",
  });
  const [recordCreate, setRecordCreate] = useState<CreateState>({
    status: "idle",
    message: "Memory writes require a selected profile and connected MetaMask account on Arkiv Braga.",
  });
  const [profileUpdate, setProfileUpdate] = useState<CreateState>({
    status: "idle",
    message: "Select a profile you own to edit or delete it.",
  });
  const [profileDelete, setProfileDelete] = useState<CreateState>({
    status: "idle",
    message: "Delete requires explicit confirmation and the connected wallet must be Arkiv $owner.",
  });
  const [recordUpdate, setRecordUpdate] = useState<CreateState>({
    status: "idle",
    message: "Select a memory record you own to edit or delete it.",
  });
  const [recordDelete, setRecordDelete] = useState<CreateState>({
    status: "idle",
    message: "Delete requires explicit confirmation and the connected wallet must be Arkiv $owner.",
  });
  const [recordDecrypt, setRecordDecrypt] = useState<LoadState & { body: string | null }>({
    body: null,
    status: "idle",
    message: "Encrypted memory bodies stay locked until the owner enters the passphrase.",
  });
  const [recordDecryptPassphrase, setRecordDecryptPassphrase] = useState("");
  const [writeDiagnostics, setWriteDiagnostics] = useState<DiagnosticsState>({
    status: "idle",
    message: "Run diagnostics before retrying a failed live write.",
    result: null,
  });
  const [profileDetail, setProfileDetail] = useState<ProfileDetailState>({
    status: "idle",
    message: "Inspect a profile to read the entity payload and metadata by key.",
    profile: null,
  });
  const [recordDetail, setRecordDetail] = useState<RecordDetailState>({
    status: "idle",
    message: "Open a memory record to inspect payload and Arkiv metadata.",
    record: null,
  });
  const [activeInspector, setActiveInspector] = useState<ActiveInspector>(null);
  const [profileInspectorMode, setProfileInspectorMode] = useState<"detail" | "edit">("detail");
  const [recordInspectorMode, setRecordInspectorMode] = useState<"detail" | "edit">("detail");
  const [profileForm, setProfileForm] = useState<MemoryProfileFormInput>(emptyProfileForm);
  const [memoryForm, setMemoryForm] = useState<MemoryRecordFormInput>(emptyMemoryForm);
  const [memoryCaptureMethod, setMemoryCaptureMethod] = useState<MemoryCaptureMethod>("typed-manually");
  const [memoryCaptureOther, setMemoryCaptureOther] = useState("");
  const [profileEditForm, setProfileEditForm] = useState<MemoryProfileFormInput>(emptyProfileForm);
  const [recordEditForm, setRecordEditForm] = useState<MemoryRecordFormInput>(emptyMemoryForm);
  const [profileFormErrors, setProfileFormErrors] = useState<MemoryProfileFieldErrors>({});
  const [memoryFormErrors, setMemoryFormErrors] = useState<MemoryRecordFieldErrors>({});
  const [profileEditErrors, setProfileEditErrors] = useState<MemoryProfileFieldErrors>({});
  const [recordEditErrors, setRecordEditErrors] = useState<MemoryRecordFieldErrors>({});

  const profileRepository = useMemo(() => {
    if (wallet.status !== "connected" || !window.ethereum) {
      return null;
    }

    return createProfileRepository(window.ethereum, wallet.address);
  }, [createProfileRepository, wallet]);

  const recordRepository = useMemo(() => {
    if (wallet.status !== "connected" || !window.ethereum) {
      return null;
    }

    return createRecordRepository(window.ethereum, wallet.address);
  }, [createRecordRepository, wallet]);

  const ownerAddress = wallet.address ?? "0x0000000000000000000000000000000000000000";
  const selectedProfile = profiles.find((profile) => profile.entityKey === selectedProfileKey) ?? null;
  const selectedRecord = records.find((record) => record.entityKey === selectedRecordKey) ?? null;
  const recordQuery = selectedProfileKey
    ? buildMemoryRecordQuery({
        ownerAddress,
        profileEntityKey: selectedProfileKey,
        tag: appliedTagFilter || undefined,
      })
    : "Select a profile to build the memory_record query.";
  const workflowSteps = [
    {
      label: wallet.status === "connected" ? "Wallet connected" : "Connect with MetaMask",
      detail:
        wallet.status === "connected"
          ? shortenHex(wallet.address)
          : "Click to connect.",
      status: wallet.status === "connected" ? "complete" : "current",
    },
    {
      label: "Create or select profile",
      detail: selectedProfile
        ? `${selectedProfile.payload.displayName} selected.`
        : profiles.length > 0
          ? "Select one."
          : "Create a container.",
      status:
        wallet.status !== "connected"
          ? "locked"
          : selectedProfile
            ? "complete"
            : profiles.length > 0
              ? "current"
              : "current",
    },
    {
      label: "Capture memory",
      detail: selectedProfile ? "Write or encrypt." : "Choose a profile first.",
      status: selectedRecord || records.length > 0 ? "complete" : selectedProfile ? "current" : "locked",
    },
    {
      label: "Retrieve and manage",
      detail: records.length > 0 ? "Open saved memory." : "Query by profile or tag.",
      status: records.length > 0 ? "current" : "locked",
    },
  ] as const;

  const refreshProfiles = useCallback(async () => {
    if (wallet.status !== "connected" || !profileRepository) {
      return;
    }

    setProfileLoad({ status: "loading", message: "Querying Arkiv Braga for owner-scoped profiles." });

    try {
      const nextProfiles = await profileRepository.listProfiles({ ownerAddress: wallet.address });
      setProfiles(nextProfiles);
      setSelectedProfileKey((currentProfileKey) => {
        if (currentProfileKey && nextProfiles.some((profile) => profile.entityKey === currentProfileKey)) {
          return currentProfileKey;
        }

        return nextProfiles[0]?.entityKey ?? "";
      });
      if (nextProfiles.length === 0) {
        setSelectedRecordKey("");
        setRecords([]);
      }
      setProfileLoad({
        status: "success",
        message:
          nextProfiles.length === 0
            ? "No memory profiles returned for this owner."
            : `${nextProfiles.length} memory profile${nextProfiles.length === 1 ? "" : "s"} returned for this owner.`,
      });
    } catch (error) {
      setProfileLoad({ status: "error", message: getErrorMessage(error) });
    }
  }, [profileRepository, wallet]);

  const refreshRecords = useCallback(async () => {
    if (wallet.status !== "connected" || !recordRepository) {
      return;
    }

    if (!selectedProfileKey) {
      setRecords([]);
      setRecordLoad({ status: "idle", message: "Select a profile to query memory records." });
      return;
    }

    setRecordLoad({ status: "loading", message: "Querying Arkiv Braga for profile-scoped memory records." });

    try {
      const nextRecords = await recordRepository.listRecords({
        ownerAddress: wallet.address,
        profileEntityKey: selectedProfileKey,
        tag: appliedTagFilter || undefined,
      });
      setRecords(nextRecords);
      setSelectedRecordKey((currentRecordKey) => {
        if (currentRecordKey && nextRecords.some((record) => record.entityKey === currentRecordKey)) {
          return currentRecordKey;
        }

        return nextRecords[0]?.entityKey ?? "";
      });
      setRecordLoad({
        status: "success",
        message:
          nextRecords.length === 0
            ? "No memory records returned for selected profile."
            : `${nextRecords.length} memory record${nextRecords.length === 1 ? "" : "s"} returned for selected profile.`,
      });
    } catch (error) {
      setRecordLoad({ status: "error", message: getErrorMessage(error) });
    }
  }, [appliedTagFilter, recordRepository, selectedProfileKey, wallet]);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);

  useEffect(() => {
    setRecordDetail({
      status: "idle",
      message: "Open a memory record to inspect payload and Arkiv metadata.",
      record: null,
    });
    setSelectedRecordKey("");
  }, [selectedProfileKey]);

  useEffect(() => {
    if (!selectedProfile) {
      setProfileEditForm(emptyProfileForm);
      return;
    }

    setProfileEditForm({
      agentPurpose: selectedProfile.payload.agentPurpose,
      displayName: selectedProfile.payload.displayName,
      notes: selectedProfile.payload.notes ?? "",
    });
    setProfileEditErrors({});
    setProfileUpdate((current) =>
      current.status === "success" || current.status === "submitting"
        ? current
        : {
            status: "idle",
            message: isEntityOwnedBy(selectedProfile, wallet.address)
              ? "Edit fields are loaded from the selected Arkiv profile."
              : "Authorization failed: selected profile owner does not match the connected wallet.",
          },
    );
  }, [selectedProfile, wallet.address]);

  useEffect(() => {
    if (!selectedRecord) {
      setRecordEditForm(emptyMemoryForm);
      return;
    }

    setRecordEditForm({
      body: isEncryptedMemoryRecord(selectedRecord) ? "" : (selectedRecord.payload.body ?? ""),
      encryptionEnabled: isEncryptedMemoryRecord(selectedRecord),
      encryptionPassphrase: "",
      importance: selectedRecord.payload.importance,
      publicTestnetAcknowledged: false,
      source: selectedRecord.payload.source ?? "",
      tags: selectedRecord.payload.tags.join(", "),
      title: selectedRecord.payload.title,
    });
    setRecordEditErrors({});
    setRecordUpdate({
      status: "idle",
      message: getSelectedRecordUpdateMessage(selectedRecord, wallet.address),
    });
  }, [selectedRecord, wallet.address]);

  useEffect(() => {
    setRecordDecryptPassphrase("");
    setRecordDecrypt({
      body: null,
      status: "idle",
      message:
        selectedRecord && isEncryptedMemoryRecord(selectedRecord)
          ? "Encrypted record selected but locked. Inspect it and enter the passphrase to decrypt the body."
          : "Plaintext record bodies are visible without decryption.",
    });
  }, [selectedRecord]);

  async function connectWallet() {
    const ethereum = window.ethereum;

    if (!ethereum) {
      setWallet({
        status: "error",
        address: null,
        message: "MetaMask was not detected. Use a browser profile with an injected wallet.",
      });
      return;
    }

    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const address = getFirstWalletAddress(accounts);

      if (!address) {
        throw new Error("No account returned by wallet.");
      }

      await ensureBragaWalletNetwork(ethereum);
      setProfiles([]);
      setRecords([]);
      setSelectedProfileKey("");
      setSelectedRecordKey("");
      setTagFilter("");
      setAppliedTagFilter("");
      setProfileFormErrors({});
      setMemoryFormErrors({});
      setProfileEditErrors({});
      setRecordEditErrors({});
      setProfileCreate({
        status: "idle",
        message: "Profile writes require a connected MetaMask account on Arkiv Braga.",
      });
      setRecordCreate({
        status: "idle",
        message: "Memory writes require a selected profile and connected MetaMask account on Arkiv Braga.",
      });
      setProfileUpdate({
        status: "idle",
        message: "Select a profile you own to edit or delete it.",
      });
      setProfileDelete({
        status: "idle",
        message: "Delete requires explicit confirmation and the connected wallet must be Arkiv $owner.",
      });
      setRecordUpdate({
        status: "idle",
        message: "Select a memory record you own to edit or delete it.",
      });
      setRecordDelete({
        status: "idle",
        message: "Delete requires explicit confirmation and the connected wallet must be Arkiv $owner.",
      });
      setRecordDecrypt({
        body: null,
        status: "idle",
        message: "Encrypted memory bodies stay locked until the owner enters the passphrase.",
      });
      setRecordDecryptPassphrase("");
      setWriteDiagnostics({
        status: "idle",
        message: "Run diagnostics before retrying a failed live write.",
        result: null,
      });
      setProfileDetail({
        status: "idle",
        message: "Inspect a profile to read the entity payload and metadata by key.",
        profile: null,
      });
      setRecordDetail({
        status: "idle",
        message: "Open a memory record to inspect payload and Arkiv metadata.",
        record: null,
      });
      setWallet({
        status: "connected",
        address,
        message: "Wallet connected on Arkiv Braga. Writes will use this owner address.",
      });
    } catch (error) {
      setWallet({
        status: "error",
        address: null,
        message: getErrorMessage(error),
      });
    }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (wallet.status !== "connected" || !profileRepository) {
      setProfileCreate({ status: "error", message: "Connect with Metamask before creating a profile." });
      return;
    }

    setProfileFormErrors({});
    setProfileCreate({ status: "submitting", message: "Submitting memory_profile to Arkiv Braga." });

    try {
      const result = await profileRepository.createProfile({
        ...profileForm,
        ownerAddress: wallet.address,
      });
      setProfileForm(emptyProfileForm);
      setSelectedProfileKey(result.entityKey);
      setProfileCreate({
        status: "success",
        entityKey: result.entityKey,
        message: "Profile transaction confirmed on Arkiv Braga.",
        txHash: result.txHash,
      });
      await refreshProfiles();
      await inspectProfile(result.entityKey);
    } catch (error) {
      if (error instanceof MemoryProfileValidationError) {
        setProfileFormErrors(error.fieldErrors);
        setProfileCreate({ status: "error", message: "Fix the profile fields before submitting." });
        return;
      }

      setProfileCreate(getMutationFailureState(error, "Profile create"));
    }
  }

  async function runWriteDiagnostics() {
    const ethereum = window.ethereum;

    if (wallet.status !== "connected" || !ethereum) {
      setWriteDiagnostics({
        status: "error",
        message: "Connect with Metamask before running write diagnostics.",
        result: null,
      });
      return;
    }

    setProfileFormErrors({});
    setWriteDiagnostics({
      status: "loading",
      message: "Running non-mutating Braga and MetaMask provider checks.",
      result: null,
    });

    try {
      const draft = createMemoryProfileDraftFromInput({
        input: {
          ...profileForm,
          ownerAddress: wallet.address,
        },
      });
      const result = await runProfileCreateDiagnostics(ethereum, wallet.address, draft);
      setWriteDiagnostics({
        status: "success",
        message: getDiagnosticsMessage(result),
        result,
      });
    } catch (error) {
      if (error instanceof MemoryProfileValidationError) {
        setProfileFormErrors(error.fieldErrors);
        setWriteDiagnostics({
          status: "error",
          message: "Fix the profile fields before running write diagnostics.",
          result: null,
        });
        return;
      }

      setWriteDiagnostics({
        status: "error",
        message: getErrorMessage(error),
        result: null,
      });
    }
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (wallet.status !== "connected" || !recordRepository) {
      setRecordCreate({ status: "error", message: "Connect with Metamask before creating a memory record." });
      return;
    }

    if (!selectedProfileKey) {
      setMemoryFormErrors({ profileEntityKey: "Select a memory profile before creating a record." });
      setRecordCreate({ status: "error", message: "Select a profile before submitting a memory record." });
      return;
    }

    setMemoryFormErrors({});
    const encryptedSubmission = Boolean(memoryForm.encryptionEnabled);
    setRecordCreate({
      status: "submitting",
      message: encryptedSubmission
        ? "Encrypting memory body in browser before submitting memory_record to Arkiv Braga."
        : "Submitting memory_record to Arkiv Braga.",
    });

    try {
      const result = await recordRepository.createRecord({
        ...memoryForm,
        ownerAddress: wallet.address,
        profileEntityKey: selectedProfileKey,
      });
      setMemoryForm(emptyMemoryForm);
      setMemoryCaptureMethod("typed-manually");
      setMemoryCaptureOther("");
      setSelectedRecordKey(result.entityKey);
      setRecordCreate({
        status: "success",
        entityKey: result.entityKey,
        message: encryptedSubmission
          ? "Encrypted memory record transaction confirmed on Arkiv Braga."
          : "Memory record transaction confirmed on Arkiv Braga.",
        txHash: result.txHash,
      });
      await refreshRecords();
      await inspectRecord(result.entityKey);
    } catch (error) {
      if (error instanceof MemoryRecordValidationError) {
        setMemoryFormErrors(error.fieldErrors);
        setRecordCreate({ status: "error", message: "Fix the memory fields before submitting." });
        return;
      }

      setRecordCreate(getMutationFailureState(error, "Memory record create"));
    }
  }

  async function updateSelectedProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (wallet.status !== "connected" || !profileRepository) {
      setProfileUpdate({ status: "error", message: "Connect with Metamask before updating a profile." });
      return;
    }

    if (!selectedProfile) {
      setProfileUpdate({ status: "error", message: "Select a profile before updating." });
      return;
    }

    if (!isEntityOwnedBy(selectedProfile, wallet.address)) {
      setProfileUpdate({ status: "error", message: ownerMismatchMessage("profile", selectedProfile, wallet.address) });
      return;
    }

    setProfileEditErrors({});
    setProfileUpdate({ status: "submitting", message: "Submitting memory_profile update to Arkiv Braga." });

    try {
      const result = await profileRepository.updateProfile({
        ...profileEditForm,
        ownerAddress: wallet.address,
        profile: selectedProfile,
      });
      const successState: CreateState = {
        status: "success",
        entityKey: result.entityKey,
        message: "Profile update transaction confirmed on Arkiv Braga.",
        txHash: result.txHash,
      };
      setProfileUpdate(successState);
      await refreshProfiles();
      await inspectProfile(selectedProfile.entityKey);
      setProfileInspectorMode("edit");
      setProfileUpdate(successState);
    } catch (error) {
      if (error instanceof MemoryProfileValidationError) {
        setProfileEditErrors(error.fieldErrors);
        setProfileUpdate({ status: "error", message: "Fix the profile edit fields before updating." });
        return;
      }

      setProfileUpdate(getMutationFailureState(error, "Profile update"));
    }
  }

  async function deleteSelectedProfile() {
    if (wallet.status !== "connected" || !profileRepository) {
      setProfileDelete({ status: "error", message: "Connect with Metamask before deleting a profile." });
      return;
    }

    if (!selectedProfile) {
      setProfileDelete({ status: "error", message: "Select a profile before deleting." });
      return;
    }

    if (!isEntityOwnedBy(selectedProfile, wallet.address)) {
      setProfileDelete({ status: "error", message: ownerMismatchMessage("profile", selectedProfile, wallet.address) });
      return;
    }

    if (!window.confirm(`Delete profile "${selectedProfile.payload.displayName}" from Arkiv Braga?`)) {
      setProfileDelete({ status: "idle", message: "Profile delete was canceled before signing." });
      return;
    }

    setProfileDelete({ status: "submitting", message: "Submitting memory_profile delete to Arkiv Braga." });

    try {
      const result = await profileRepository.deleteProfile({
        ownerAddress: wallet.address,
        profile: selectedProfile,
      });
      setProfileDelete({
        status: "success",
        entityKey: result.entityKey,
        message: "Profile delete transaction confirmed on Arkiv Braga.",
        txHash: result.txHash,
      });
      setProfileDetail({
        status: "idle",
        message: "Deleted profile removed from the selected detail view.",
        profile: null,
      });
      setSelectedProfileKey("");
      setRecords([]);
      setSelectedRecordKey("");
      await refreshProfiles();
    } catch (error) {
      setProfileDelete(getMutationFailureState(error, "Profile delete"));
    }
  }

  async function updateSelectedRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (wallet.status !== "connected" || !recordRepository) {
      setRecordUpdate({ status: "error", message: "Connect with Metamask before updating a memory record." });
      return;
    }

    if (!selectedRecord) {
      setRecordUpdate({ status: "error", message: "Select a memory record before updating." });
      return;
    }

    if (!isEntityOwnedBy(selectedRecord, wallet.address)) {
      setRecordUpdate({ status: "error", message: ownerMismatchMessage("memory record", selectedRecord, wallet.address) });
      return;
    }

    setRecordEditErrors({});
    const encryptedSubmission = Boolean(recordEditForm.encryptionEnabled);
    setRecordUpdate({
      status: "submitting",
      message: encryptedSubmission
        ? "Encrypting updated memory body in browser before submitting to Arkiv Braga."
        : "Submitting memory_record update to Arkiv Braga.",
    });

    try {
      const result = await recordRepository.updateRecord({
        ...recordEditForm,
        ownerAddress: wallet.address,
        record: selectedRecord,
      });
      const successState: CreateState = {
        status: "success",
        entityKey: result.entityKey,
        message: encryptedSubmission
          ? "Encrypted memory record update transaction confirmed on Arkiv Braga."
          : "Memory record update transaction confirmed on Arkiv Braga.",
        txHash: result.txHash,
      };
      setRecordUpdate(successState);
      await refreshRecords();
      await inspectRecord(selectedRecord.entityKey);
      setRecordInspectorMode("edit");
      setRecordUpdate(successState);
    } catch (error) {
      if (error instanceof MemoryRecordValidationError) {
        setRecordEditErrors(error.fieldErrors);
        setRecordUpdate({ status: "error", message: "Fix the memory edit fields before updating." });
        return;
      }

      setRecordUpdate(getMutationFailureState(error, "Memory record update"));
    }
  }

  async function deleteSelectedRecord() {
    if (wallet.status !== "connected" || !recordRepository) {
      setRecordDelete({ status: "error", message: "Connect with Metamask before deleting a memory record." });
      return;
    }

    if (!selectedRecord) {
      setRecordDelete({ status: "error", message: "Select a memory record before deleting." });
      return;
    }

    if (!isEntityOwnedBy(selectedRecord, wallet.address)) {
      setRecordDelete({ status: "error", message: ownerMismatchMessage("memory record", selectedRecord, wallet.address) });
      return;
    }

    if (!window.confirm(`Delete memory record "${selectedRecord.payload.title}" from Arkiv Braga?`)) {
      setRecordDelete({ status: "idle", message: "Memory record delete was canceled before signing." });
      return;
    }

    setRecordDelete({ status: "submitting", message: "Submitting memory_record delete to Arkiv Braga." });

    try {
      const result = await recordRepository.deleteRecord({
        ownerAddress: wallet.address,
        record: selectedRecord,
      });
      setRecordDelete({
        status: "success",
        entityKey: result.entityKey,
        message: "Memory record delete transaction confirmed on Arkiv Braga.",
        txHash: result.txHash,
      });
      setRecordDetail({
        status: "idle",
        message: "Deleted memory record removed from the selected detail view.",
        record: null,
      });
      setSelectedRecordKey("");
      await refreshRecords();
    } catch (error) {
      setRecordDelete(getMutationFailureState(error, "Memory record delete"));
    }
  }

  async function inspectProfile(entityKey: Hex) {
    if (!profileRepository) {
      return;
    }

    setSelectedProfileKey(entityKey);
    setProfileInspectorMode("detail");
    setActiveInspector("profile");
    setProfileDetail({ status: "loading", message: "Reading profile entity by key.", profile: null });

    try {
      const profile = await profileRepository.readProfile({ entityKey });
      setProfileDetail({ status: "success", message: "Profile entity loaded by key.", profile });
    } catch (error) {
      setProfileDetail({ status: "error", message: getErrorMessage(error), profile: null });
    }
  }

  function openProfileEditor(profile: MemoryProfile) {
    setSelectedProfileKey(profile.entityKey);
    setProfileEditForm({
      agentPurpose: profile.payload.agentPurpose,
      displayName: profile.payload.displayName,
      notes: profile.payload.notes ?? "",
    });
    setProfileEditErrors({});
    setProfileInspectorMode("edit");
  }

  async function inspectRecord(entityKey: Hex) {
    if (!recordRepository) {
      return;
    }

    setSelectedRecordKey(entityKey);
    setRecordInspectorMode("detail");
    setActiveInspector("record");
    setRecordDetail({ status: "loading", message: "Reading memory_record entity by key.", record: null });

    try {
      const record = await recordRepository.readRecord({ entityKey });
      setRecordDetail({ status: "success", message: "Memory record entity loaded by key.", record });
      setRecordDecryptPassphrase("");
      setRecordDecrypt({
        body: null,
        status: "idle",
        message: isEncryptedMemoryRecord(record)
          ? "Encrypted memory record loaded but locked. Passphrase required to decrypt the body."
          : "Plaintext memory body is visible in the payload.",
      });
    } catch (error) {
      setRecordDetail({ status: "error", message: getErrorMessage(error), record: null });
    }
  }

  function openRecordEditor(record: MemoryRecord) {
    setSelectedRecordKey(record.entityKey);
    setRecordEditForm({
      body: isEncryptedMemoryRecord(record) ? "" : (record.payload.body ?? ""),
      encryptionEnabled: isEncryptedMemoryRecord(record),
      encryptionPassphrase: "",
      importance: record.payload.importance,
      publicTestnetAcknowledged: false,
      source: record.payload.source ?? "",
      tags: record.payload.tags.join(", "),
      title: record.payload.title,
    });
    setRecordEditErrors({});
    setRecordInspectorMode("edit");
  }

  async function decryptSelectedRecordBody() {
    const record = recordDetail.record ?? selectedRecord;

    if (!record) {
      setRecordDecrypt({
        body: null,
        status: "error",
        message: "Select or inspect an encrypted memory record before decrypting.",
      });
      return;
    }

    if (!isEncryptedMemoryRecord(record)) {
      setRecordDecrypt({
        body: record.payload.body ?? "",
        status: "success",
        message: "Plaintext memory body is already visible.",
      });
      return;
    }

    if (!recordDecryptPassphrase.trim()) {
      setRecordDecrypt({
        body: null,
        status: "error",
        message: "Passphrase required to decrypt this encrypted memory body.",
      });
      return;
    }

    setRecordDecrypt({
      body: null,
      status: "loading",
      message: "Decrypting memory body in this browser session.",
    });

    try {
      const body = await decryptRecordBody(record, recordDecryptPassphrase);
      setRecordDecryptPassphrase("");
      setRecordDecrypt({
        body,
        status: "success",
        message: "Memory body decrypted in this browser session.",
      });
    } catch (error) {
      setRecordDecryptPassphrase("");
      setRecordDecrypt({
        body: null,
        status: "error",
        message: `Decryption failed: ${getErrorMessage(error)}`,
      });
    }
  }

  function clearDecryptedRecordBody() {
    setRecordDecryptPassphrase("");
    setRecordDecrypt({
      body: null,
      status: "idle",
      message: "Decrypted memory body cleared from the current view.",
    });
  }

  function queryRecordsByTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedTagFilter(tagFilter.trim());
  }

  function clearTagFilter() {
    setTagFilter("");
    setAppliedTagFilter("");
  }

  const profileInspectorEntity = profileDetail.profile;
  const canEditProfileInInspector =
    wallet.status === "connected" &&
    profileInspectorEntity !== null &&
    isEntityOwnedBy(profileInspectorEntity, wallet.address);
  const recordInspectorEntity = recordDetail.record;
  const canEditRecordInInspector =
    wallet.status === "connected" &&
    recordInspectorEntity !== null &&
    isEntityOwnedBy(recordInspectorEntity, wallet.address);

  function scrollToElementById(id: string) {
    const target = document.getElementById(id);
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="workflow-title">
        <section className="workflow-panel" aria-labelledby="workflow-title">
          <div className="workflow-intro">
            <h1 id="workflow-title">[Arkiv Lantern]</h1>
            <div className="workflow-intro-head">
              <p className="eyebrow">Arkiv Braga testnet</p>
            </div>
            <p className="hero-copy">
              Create wallet-owned memory for an AI agent, store it on Arkiv, then retrieve it by profile or tag.
            </p>
          </div>
          <ol className="workflow-steps">
            {workflowSteps.map((step, index) => (
              <li className={`workflow-step ${step.status}`} key={step.label}>
                <button
                  className={`workflow-step-button ${index === 0 ? "workflow-step-connect-button" : ""}`}
                  type="button"
                  onClick={index === 0 ? connectWallet : () => scrollToElementById(`step-${index + 1}`)}
                >
                  <span>{step.label}</span>
                  <p>{step.detail}</p>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <p className={`operation-message ${wallet.status}`} role="status">
          {wallet.message}
        </p>

        <div className="workflow-stack">
          <section className="panel" id="step-1" aria-labelledby="profile-form-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Step 1</p>
                <h2 id="profile-form-title">Create a profile</h2>
                <p className="panel-copy">Name the agent or use case.</p>
              </div>
              <code className="owner-pill">{shortenHex(ownerAddress)}</code>
            </div>

            <form className="profile-form" onSubmit={createProfile}>
              <label className="required-label" htmlFor="displayName">
                Display name
              </label>
              <input
                id="displayName"
                name="displayName"
                value={profileForm.displayName}
                disabled={wallet.status !== "connected" || profileCreate.status === "submitting"}
                aria-describedby={profileFormErrors.displayName ? "displayName-error" : undefined}
                onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })}
              />
              {profileFormErrors.displayName && (
                <p className="field-error" id="displayName-error">
                  {profileFormErrors.displayName}
                </p>
              )}

              <label className="required-label" htmlFor="agentPurpose">
                Agent purpose
              </label>
              <textarea
                id="agentPurpose"
                name="agentPurpose"
                rows={4}
                value={profileForm.agentPurpose}
                disabled={wallet.status !== "connected" || profileCreate.status === "submitting"}
                aria-describedby={profileFormErrors.agentPurpose ? "agentPurpose-error" : undefined}
                onChange={(event) => setProfileForm({ ...profileForm, agentPurpose: event.target.value })}
              />
              {profileFormErrors.agentPurpose && (
                <p className="field-error" id="agentPurpose-error">
                  {profileFormErrors.agentPurpose}
                </p>
              )}

              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={profileForm.notes}
                disabled={wallet.status !== "connected" || profileCreate.status === "submitting"}
                aria-describedby={profileFormErrors.notes ? "notes-error" : undefined}
                onChange={(event) => setProfileForm({ ...profileForm, notes: event.target.value })}
              />
              {profileFormErrors.notes && (
                <p className="field-error" id="notes-error">
                  {profileFormErrors.notes}
                </p>
              )}

              <button
                className="primary-action"
                type="submit"
                disabled={wallet.status !== "connected" || profileCreate.status === "submitting"}
              >
                {profileCreate.status === "submitting" ? "Submitting profile" : "Create profile"}
              </button>

              <p className={`operation-message ${profileCreate.status}`} role="status">
                {profileCreate.message}
              </p>
              {profileCreate.status === "success" && <ReceiptGrid entityKey={profileCreate.entityKey} txHash={profileCreate.txHash} />}
            </form>
          </section>

          <section className="panel" id="step-2" aria-labelledby="profile-list-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Step 2</p>
                <h2 id="profile-list-title">Choose a profile</h2>
                <p className="panel-copy">Wallet-scoped profiles.</p>
              </div>
              <button
                className="secondary-action"
                type="button"
                disabled={!profileRepository || profileLoad.status === "loading"}
                onClick={() => void refreshProfiles()}
              >
                Refresh
              </button>
            </div>

            <p className={`operation-message ${profileLoad.status}`} role="status">
              {profileLoad.message}
            </p>

            {profiles.length > 0 ? (
              <div className="profile-list" aria-label="Memory profiles">
                {profiles.map((profile) => (
                  <article className={`profile-row ${profile.entityKey === selectedProfileKey ? "selected" : ""}`} key={profile.entityKey}>
                    <div>
                      <h3>{profile.payload.displayName}</h3>
                      <p>{profile.payload.agentPurpose}</p>
                      <code>{profile.entityKey}</code>
                    </div>
                    <div className="row-actions">
                      <button
                        className="primary-action"
                        type="button"
                        onClick={() => setSelectedProfileKey(profile.entityKey)}
                      >
                        Select
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => void inspectProfile(profile.entityKey)}
                      >
                        Inspect
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
                <p className="empty-state">No profile yet. Create one above, then use it to save memories.</p>
            )}

          </section>

          <section className="panel" id="step-3" aria-labelledby="memory-form-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Step 3</p>
                <h2 id="memory-form-title">Capture a memory</h2>
                <p className="panel-copy">Store one note on Arkiv Braga.</p>
              </div>
              <code className="owner-pill">{shortenHex(ownerAddress)}</code>
            </div>

            <form className="profile-form" onSubmit={createRecord}>
              <div className="memory-metadata-grid">
                <div>
                  <label className="required-label" htmlFor="selectedProfile">
                    Profile
                  </label>
                  <select
                    id="selectedProfile"
                    value={selectedProfileKey}
                    disabled={wallet.status !== "connected" || profiles.length === 0}
                    aria-describedby={memoryFormErrors.profileEntityKey ? "profileEntityKey-error" : undefined}
                    onChange={(event) => setSelectedProfileKey(event.target.value)}
                  >
                    <option value="">Select a profile</option>
                    {profiles.map((profile) => (
                      <option key={profile.entityKey} value={profile.entityKey}>
                        {profile.payload.displayName}
                      </option>
                    ))}
                  </select>
                  {memoryFormErrors.profileEntityKey && (
                    <p className="field-error" id="profileEntityKey-error">
                      {memoryFormErrors.profileEntityKey}
                    </p>
                  )}
                </div>
                <div>
                  <label className="required-label" htmlFor="memoryTitle">
                    Title
                  </label>
                  <input
                    id="memoryTitle"
                    name="memoryTitle"
                    value={memoryForm.title}
                    disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                    aria-describedby={memoryFormErrors.title ? "memoryTitle-error" : undefined}
                    onChange={(event) => setMemoryForm({ ...memoryForm, title: event.target.value })}
                  />
                  {memoryFormErrors.title && (
                    <p className="field-error" id="memoryTitle-error">
                      {memoryFormErrors.title}
                    </p>
                  )}
                </div>
              </div>
              {selectedProfile && <p className="selected-profile">Selected profile key: {selectedProfile.entityKey}</p>}

              <label className="required-label" htmlFor="memoryBody">
                Body
              </label>
              <textarea
                id="memoryBody"
                name="memoryBody"
                rows={6}
                value={memoryForm.body}
                disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                aria-describedby={memoryFormErrors.body ? "memoryBody-error" : undefined}
                onChange={(event) => setMemoryForm({ ...memoryForm, body: event.target.value })}
              />
              {memoryFormErrors.body && (
                <p className="field-error" id="memoryBody-error">
                  {memoryFormErrors.body}
                </p>
              )}

              <label className="checkbox-row" htmlFor="memoryEncryptionEnabled">
                <input
                  id="memoryEncryptionEnabled"
                  type="checkbox"
                  checked={Boolean(memoryForm.encryptionEnabled)}
                  disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                  onChange={(event) =>
                    setMemoryForm({
                      ...memoryForm,
                      encryptionEnabled: event.target.checked,
                      encryptionPassphrase: "",
                      publicTestnetAcknowledged: event.target.checked ? false : memoryForm.publicTestnetAcknowledged,
                    })
                  }
                />
                <span>Encrypt memory body with a passphrase</span>
              </label>
              <p className={`privacy-state ${memoryForm.encryptionEnabled ? "locked" : "open"}`}>
                {memoryForm.encryptionEnabled
                  ? "Only the body is encrypted in this browser before it is written. Keep the passphrase; Arkiv Lantern cannot recover it."
                  : "The body will be written as plaintext JSON on Braga testnet. Use demo-safe content only."}
              </p>

              {memoryForm.encryptionEnabled && (
                <>
                  <label className="required-label" htmlFor="memoryEncryptionPassphrase">
                    Encryption passphrase
                  </label>
                  <input
                    id="memoryEncryptionPassphrase"
                    name="memoryEncryptionPassphrase"
                    type="password"
                    autoComplete="off"
                    value={memoryForm.encryptionPassphrase ?? ""}
                    disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                    aria-describedby={memoryFormErrors.encryptionPassphrase ? "memoryEncryptionPassphrase-error" : undefined}
                    onChange={(event) =>
                      setMemoryForm({ ...memoryForm, encryptionPassphrase: event.target.value })
                    }
                  />
                  {memoryFormErrors.encryptionPassphrase && (
                    <p className="field-error" id="memoryEncryptionPassphrase-error">
                      {memoryFormErrors.encryptionPassphrase}
                    </p>
                  )}
                </>
              )}

              <label htmlFor="memorySourceMethod">How was this captured?</label>
              <select
                id="memorySourceMethod"
                value={memoryCaptureMethod}
                disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                aria-describedby="memorySource-help"
                onChange={(event) => {
                  const method = event.target.value as MemoryCaptureMethod;
                  setMemoryCaptureMethod(method);
                  setMemoryForm({ ...memoryForm, source: buildMemorySourceValue(method, memoryCaptureOther) });
                }}
              >
                <option value="typed-manually">Typed manually</option>
                <option value="chat">Copied from chat</option>
                <option value="docs-web">From docs/web</option>
                <option value="imported">Imported</option>
                <option value="other">Other</option>
              </select>
              <p className="panel-copy" id="memorySource-help">Used for filtering and context later.</p>
              {memoryCaptureMethod === OTHER_CAPTURE_METHOD && (
                <>
                  <label htmlFor="memorySourceOther">Describe source</label>
                  <input
                    id="memorySourceOther"
                    name="memorySourceOther"
                    value={memoryCaptureOther}
                    placeholder="meeting notes, call transcript, etc."
                    disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                    aria-describedby={memoryFormErrors.source ? "memorySource-error" : undefined}
                    onChange={(event) => {
                      const nextOther = event.target.value;
                      setMemoryCaptureOther(nextOther);
                      setMemoryForm({ ...memoryForm, source: buildMemorySourceValue(memoryCaptureMethod, nextOther) });
                    }}
                  />
                </>
              )}
              {memoryFormErrors.source && (
                <p className="field-error" id="memorySource-error">
                  {memoryFormErrors.source}
                </p>
              )}
              <div className="memory-metadata-grid">
                <div>
                  <label className="required-label" htmlFor="memoryImportance">
                    Importance
                  </label>
                  <select
                    id="memoryImportance"
                    value={memoryForm.importance}
                    disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                    aria-describedby={memoryFormErrors.importance ? "memoryImportance-error" : undefined}
                    onChange={(event) =>
                      setMemoryForm({
                        ...memoryForm,
                        importance: event.target.value as MemoryRecordFormInput["importance"],
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  {memoryFormErrors.importance && (
                    <p className="field-error" id="memoryImportance-error">
                      {memoryFormErrors.importance}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="memoryTags">Tags</label>
                  <input
                    id="memoryTags"
                    name="memoryTags"
                    value={memoryForm.tags}
                    placeholder="preference, research"
                    disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                    aria-describedby={memoryFormErrors.tags ? "memoryTags-error" : undefined}
                    onChange={(event) => setMemoryForm({ ...memoryForm, tags: event.target.value })}
                  />
                  {memoryFormErrors.tags && (
                    <p className="field-error" id="memoryTags-error">
                      {memoryFormErrors.tags}
                    </p>
                  )}
                </div>
              </div>

              {!memoryForm.encryptionEnabled && (
                <>
                  <label className="checkbox-row required-label" htmlFor="publicTestnetAcknowledged">
                    <input
                      id="publicTestnetAcknowledged"
                      type="checkbox"
                      checked={memoryForm.publicTestnetAcknowledged}
                      disabled={!selectedProfileKey || recordCreate.status === "submitting"}
                      aria-describedby={
                        memoryFormErrors.publicTestnetAcknowledged ? "publicTestnetAcknowledged-error" : undefined
                      }
                      onChange={(event) =>
                        setMemoryForm({ ...memoryForm, publicTestnetAcknowledged: event.target.checked })
                      }
                    />
                    <span>I understand this memory body may be public on Braga testnet.</span>
                  </label>
                  {memoryFormErrors.publicTestnetAcknowledged && (
                    <p className="field-error" id="publicTestnetAcknowledged-error">
                      {memoryFormErrors.publicTestnetAcknowledged}
                    </p>
                  )}
                </>
              )}

              <button
                className="primary-action"
                type="submit"
                disabled={!selectedProfileKey || recordCreate.status === "submitting"}
              >
                {recordCreate.status === "submitting" ? "Submitting memory" : "Save memory"}
              </button>

              <p className={`operation-message ${recordCreate.status}`} role="status">
                {recordCreate.message}
              </p>
              {recordCreate.status === "success" && <ReceiptGrid entityKey={recordCreate.entityKey} txHash={recordCreate.txHash} />}
            </form>
          </section>

          <section className="panel" id="step-4" aria-labelledby="memory-list-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Step 4</p>
                <h2 id="memory-list-title">Retrieve memories</h2>
                <p className="panel-copy">Query by profile or tag.</p>
              </div>
              <button
                className="secondary-action"
                type="button"
                disabled={!selectedProfileKey || !recordRepository || recordLoad.status === "loading"}
                onClick={() => void refreshRecords()}
              >
                Refresh
              </button>
            </div>

            <form className="filter-form" onSubmit={queryRecordsByTag}>
              <label htmlFor="tagFilter">Tag filter</label>
              <div className="filter-controls">
                <input
                  id="tagFilter"
                  value={tagFilter}
                  placeholder="research"
                  disabled={!selectedProfileKey}
                  onChange={(event) => setTagFilter(event.target.value)}
                />
                <button className="secondary-action" type="submit" disabled={!selectedProfileKey}>
                  Query tag
                </button>
                <button className="secondary-action" type="button" disabled={!selectedProfileKey} onClick={clearTagFilter}>
                  Clear
                </button>
              </div>
            </form>

            <p className={`operation-message ${recordLoad.status}`} role="status">
              {recordLoad.message}
            </p>

            {records.length > 0 ? (
              <div className="profile-list" aria-label="Memory records">
                {records.map((record) => (
                  <article className={`profile-row ${record.entityKey === selectedRecordKey ? "selected" : ""}`} key={record.entityKey}>
                    <div>
                      <h3>{record.payload.title}</h3>
                      <p>{getMemoryRecordBodyPreview(record)}</p>
                      {isEncryptedMemoryRecord(record) && <p className="privacy-state locked">Encrypted body locked</p>}
                      <p className="tag-list">Tags: {record.payload.tags.length ? record.payload.tags.join(", ") : "none"}</p>
                      <code>{record.entityKey}</code>
                    </div>
                    <div className="row-actions">
                      <button
                        className="primary-action"
                        type="button"
                        onClick={() => setSelectedRecordKey(record.entityKey)}
                      >
                        Select
                      </button>
                      <button className="secondary-action" type="button" onClick={() => void inspectRecord(record.entityKey)}>
                        Inspect
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">
                {selectedProfileKey
                  ? "No memories match this profile and tag. Save one above, or clear the tag filter."
                  : "Select a profile before retrieving memories."}
              </p>
            )}

            <details className="query-details advanced-details">
              <summary>Memory record query</summary>
              <code>{recordQuery}</code>
            </details>
          </section>

          <details className="panel advanced-panel network-panel">
            <summary>
              <span>
                <span className="eyebrow">Advanced</span>
                <strong>Arkiv contract, diagnostics, and network details</strong>
              </span>
            </summary>

            <section className="status-strip" aria-label="Arkiv entity contract">
              <div>
                <span>Project attribute</span>
                <strong>
                  {PROJECT_ATTRIBUTE_KEY} = {PROJECT_ATTRIBUTE_VALUE}
                </strong>
              </div>
              <div>
                <span>Entity types</span>
                <strong>memory_profile + memory_record</strong>
              </div>
              <div>
                <span>Expires in</span>
                <strong>{ENTITY_EXPIRES_IN_DAYS} days</strong>
              </div>
            </section>

            <section className="diagnostic-panel" aria-labelledby="write-diagnostics-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Diagnostics</p>
                  <h2 id="write-diagnostics-title">Write preflight</h2>
                  <p className="panel-copy">Use this only when a live write fails before Braga accepts the transaction.</p>
                </div>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={wallet.status !== "connected" || writeDiagnostics.status === "loading"}
                  onClick={() => void runWriteDiagnostics()}
                >
                  {writeDiagnostics.status === "loading" ? "Running checks" : "Run write diagnostics"}
                </button>
              </div>

              <p className={`operation-message ${writeDiagnostics.status}`} role="status">
                {writeDiagnostics.message}
              </p>

              {writeDiagnostics.result && <DiagnosticsReport result={writeDiagnostics.result} />}
            </section>

            <section aria-labelledby="network-title">
              <p className="eyebrow">Network</p>
              <h2 id="network-title">Braga endpoints</h2>
              <div className="link-list">
                <a href={BRAGA_RPC_URL}>RPC</a>
                <a href={BRAGA_EXPLORER_URL}>Explorer</a>
              </div>
            </section>
          </details>
        </div>

        {activeInspector === "record" && (
          <EntityDetailPopover
            explorerUrl={BRAGA_EXPLORER_URL}
            headerActions={
              recordInspectorEntity ? (
                <button
                  className="secondary-action"
                  type="button"
                  disabled={!canEditRecordInInspector || recordUpdate.status === "submitting"}
                  onClick={() =>
                    recordInspectorMode === "edit"
                      ? setRecordInspectorMode("detail")
                      : openRecordEditor(recordInspectorEntity)
                  }
                >
                  {recordInspectorMode === "edit" ? "Memory detail" : "Edit memory"}
                </button>
              ) : null
            }
            heading="Memory detail"
            label="Inspect"
            status={recordDetail.status}
            message={recordDetail.message}
            entity={recordDetail.record}
            onClose={() => setActiveInspector(null)}
            extraContent={
              recordInspectorMode === "edit" && selectedRecord && recordInspectorEntity ? (
                <RecordEditPanel
                  form={recordEditForm}
                  formErrors={recordEditErrors}
                  onDelete={() => void deleteSelectedRecord()}
                  onFormChange={setRecordEditForm}
                  onSubmit={updateSelectedRecord}
                  record={selectedRecord}
                  recordDelete={recordDelete}
                  recordUpdate={recordUpdate}
                />
              ) : recordDelete.status === "success" ? (
                <>
                  <p className={`operation-message ${recordDelete.status}`} role="status">
                    {recordDelete.message}
                  </p>
                  <ReceiptGrid entityKey={recordDelete.entityKey} txHash={recordDelete.txHash} />
                </>
              ) : recordDetail.record && isEncryptedMemoryRecord(recordDetail.record) ? (
                <RecordDecryptPanel
                  decryptState={recordDecrypt}
                  disabled={recordDecrypt.status === "loading"}
                  passphrase={recordDecryptPassphrase}
                  onClear={clearDecryptedRecordBody}
                  onDecrypt={() => void decryptSelectedRecordBody()}
                  onPassphraseChange={setRecordDecryptPassphrase}
                />
              ) : null
            }
          />
        )}

        {activeInspector === "profile" && (
          <EntityDetailPopover
            explorerUrl={BRAGA_EXPLORER_URL}
            headerActions={
              profileInspectorEntity ? (
                <button
                  className="secondary-action"
                  type="button"
                  disabled={!canEditProfileInInspector || profileUpdate.status === "submitting"}
                  onClick={() =>
                    profileInspectorMode === "edit"
                      ? setProfileInspectorMode("detail")
                      : openProfileEditor(profileInspectorEntity)
                  }
                >
                  {profileInspectorMode === "edit" ? "Profile detail" : "Edit profile"}
                </button>
              ) : null
            }
            heading="Profile detail"
            label="Inspect"
            status={profileDetail.status}
            message={profileDetail.message}
            entity={profileDetail.profile}
            onClose={() => setActiveInspector(null)}
            extraContent={
              profileInspectorMode === "edit" && selectedProfile && profileInspectorEntity ? (
                <ProfileEditPanel
                  form={profileEditForm}
                  formErrors={profileEditErrors}
                  profile={selectedProfile}
                  profileDelete={profileDelete}
                  profileUpdate={profileUpdate}
                  onDelete={() => void deleteSelectedProfile()}
                  onFormChange={setProfileEditForm}
                  onSubmit={updateSelectedProfile}
                />
              ) : profileDelete.status === "success" ? (
                <>
                  <p className={`operation-message ${profileDelete.status}`} role="status">
                    {profileDelete.message}
                  </p>
                  <ReceiptGrid entityKey={profileDelete.entityKey} txHash={profileDelete.txHash} />
                </>
              ) : null
            }
          />
        )}
      </section>
    </main>
  );
}

interface ReceiptGridProps {
  entityKey: string;
  txHash: string;
}

function ReceiptGrid({ entityKey, txHash }: ReceiptGridProps) {
  return (
    <dl className="receipt-grid">
      <div>
        <dt>Entity key</dt>
        <dd>{entityKey}</dd>
      </div>
      <div>
        <dt>Transaction</dt>
        <dd>{txHash}</dd>
      </div>
    </dl>
  );
}

interface ProfileEditPanelProps {
  form: MemoryProfileFormInput;
  formErrors: MemoryProfileFieldErrors;
  onDelete: () => void;
  onFormChange: (form: MemoryProfileFormInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profile: MemoryProfile;
  profileDelete: CreateState;
  profileUpdate: CreateState;
}

function ProfileEditPanel({
  form,
  formErrors,
  onDelete,
  onFormChange,
  onSubmit,
  profile,
  profileDelete,
  profileUpdate,
}: ProfileEditPanelProps) {
  return (
    <section className="inspector-edit-panel" aria-label="Edit selected profile">
      <div>
        <p className="eyebrow">Profile tools</p>
        <h3>Edit profile</h3>
        <p className="selected-profile">Arkiv $owner: {profile.ownerAddress ?? "Not returned"}</p>
      </div>

      <form className="profile-form" onSubmit={onSubmit}>
        <label className="required-label" htmlFor="editDisplayName">
          Profile display name
        </label>
        <input
          id="editDisplayName"
          name="editDisplayName"
          value={form.displayName}
          disabled={profileUpdate.status === "submitting"}
          aria-describedby={formErrors.displayName ? "editDisplayName-error" : undefined}
          onChange={(event) => onFormChange({ ...form, displayName: event.target.value })}
        />
        {formErrors.displayName && (
          <p className="field-error" id="editDisplayName-error">
            {formErrors.displayName}
          </p>
        )}

        <label className="required-label" htmlFor="editAgentPurpose">
          Profile agent purpose
        </label>
        <textarea
          id="editAgentPurpose"
          name="editAgentPurpose"
          rows={4}
          value={form.agentPurpose}
          disabled={profileUpdate.status === "submitting"}
          aria-describedby={formErrors.agentPurpose ? "editAgentPurpose-error" : undefined}
          onChange={(event) => onFormChange({ ...form, agentPurpose: event.target.value })}
        />
        {formErrors.agentPurpose && (
          <p className="field-error" id="editAgentPurpose-error">
            {formErrors.agentPurpose}
          </p>
        )}

        <label htmlFor="editNotes">Profile notes</label>
        <textarea
          id="editNotes"
          name="editNotes"
          rows={3}
          value={form.notes}
          disabled={profileUpdate.status === "submitting"}
          aria-describedby={formErrors.notes ? "editNotes-error" : undefined}
          onChange={(event) => onFormChange({ ...form, notes: event.target.value })}
        />
        {formErrors.notes && (
          <p className="field-error" id="editNotes-error">
            {formErrors.notes}
          </p>
        )}

        <div className="mutation-actions">
          <button className="primary-action" type="submit" disabled={profileUpdate.status === "submitting"}>
            {profileUpdate.status === "submitting" ? "Updating profile" : "Update profile"}
          </button>
          <button
            className="danger-action"
            type="button"
            disabled={profileDelete.status === "submitting"}
            onClick={onDelete}
          >
            {profileDelete.status === "submitting" ? "Deleting profile" : "Delete profile"}
          </button>
        </div>

        <p className={`operation-message ${profileUpdate.status}`} role="status">
          {profileUpdate.message}
        </p>
        {profileUpdate.status === "success" && <ReceiptGrid entityKey={profileUpdate.entityKey} txHash={profileUpdate.txHash} />}
      </form>

      <p className={`operation-message ${profileDelete.status}`} role="status">
        {profileDelete.message}
      </p>
      {profileDelete.status === "success" && <ReceiptGrid entityKey={profileDelete.entityKey} txHash={profileDelete.txHash} />}
    </section>
  );
}

interface RecordEditPanelProps {
  form: MemoryRecordFormInput;
  formErrors: MemoryRecordFieldErrors;
  onDelete: () => void;
  onFormChange: (form: MemoryRecordFormInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  record: MemoryRecord;
  recordDelete: CreateState;
  recordUpdate: CreateState;
}

function RecordEditPanel({
  form,
  formErrors,
  onDelete,
  onFormChange,
  onSubmit,
  record,
  recordDelete,
  recordUpdate,
}: RecordEditPanelProps) {
  return (
    <section className="inspector-edit-panel" aria-label="Edit selected memory">
      <div>
        <p className="eyebrow">Memory tools</p>
        <h3>Edit memory</h3>
        <p className="selected-profile">Profile relationship: {record.payload.profileEntityKey}</p>
        <p className="selected-profile">Arkiv $owner: {record.ownerAddress ?? "Not returned"}</p>
      </div>

      <form className="profile-form" onSubmit={onSubmit}>
        <label className="required-label" htmlFor="editMemoryTitle">
          Record title
        </label>
        <input
          id="editMemoryTitle"
          name="editMemoryTitle"
          value={form.title}
          disabled={recordUpdate.status === "submitting"}
          aria-describedby={formErrors.title ? "editMemoryTitle-error" : undefined}
          onChange={(event) => onFormChange({ ...form, title: event.target.value })}
        />
        {formErrors.title && (
          <p className="field-error" id="editMemoryTitle-error">
            {formErrors.title}
          </p>
        )}

        {isEncryptedMemoryRecord(record) && (
          <section className="notice encrypted-warning" aria-label="Encrypted memory update warning">
            Encrypted body is locked in this edit form. Enter a replacement body and passphrase to update it.
          </section>
        )}

        <label className="checkbox-row" htmlFor="editMemoryEncryptionEnabled">
          <input
            id="editMemoryEncryptionEnabled"
            type="checkbox"
            checked={Boolean(form.encryptionEnabled)}
            disabled={recordUpdate.status === "submitting"}
            onChange={(event) =>
              onFormChange({
                ...form,
                encryptionEnabled: event.target.checked,
                encryptionPassphrase: "",
                publicTestnetAcknowledged: event.target.checked ? false : form.publicTestnetAcknowledged,
              })
            }
          />
          <span>Encrypt updated memory body with a passphrase</span>
        </label>
        <p className={`privacy-state ${form.encryptionEnabled ? "locked" : "open"}`}>
          {form.encryptionEnabled
            ? "Encryption enabled. Body will be encrypted; title, tags, source, and importance remain searchable metadata."
            : "Encryption disabled. Updated body will be written as plaintext JSON on Braga testnet."}
        </p>

        <label className="required-label" htmlFor="editMemoryBody">
          Record body
        </label>
        <textarea
          id="editMemoryBody"
          name="editMemoryBody"
          rows={6}
          value={form.body}
          disabled={recordUpdate.status === "submitting"}
          aria-describedby={formErrors.body ? "editMemoryBody-error" : undefined}
          onChange={(event) => onFormChange({ ...form, body: event.target.value })}
        />
        {formErrors.body && (
          <p className="field-error" id="editMemoryBody-error">
            {formErrors.body}
          </p>
        )}

        {form.encryptionEnabled ? (
          <>
            <label className="required-label" htmlFor="editMemoryEncryptionPassphrase">
              Update encryption passphrase
            </label>
            <input
              id="editMemoryEncryptionPassphrase"
              name="editMemoryEncryptionPassphrase"
              type="password"
              autoComplete="off"
              value={form.encryptionPassphrase ?? ""}
              disabled={recordUpdate.status === "submitting"}
              aria-describedby={formErrors.encryptionPassphrase ? "editMemoryEncryptionPassphrase-error" : undefined}
              onChange={(event) => onFormChange({ ...form, encryptionPassphrase: event.target.value })}
            />
            {formErrors.encryptionPassphrase && (
              <p className="field-error" id="editMemoryEncryptionPassphrase-error">
                {formErrors.encryptionPassphrase}
              </p>
            )}
          </>
        ) : (
          <section className="notice memory-warning" aria-label="Memory update public testnet warning">
            Updating replaces the plaintext JSON payload on Braga testnet. Use non-sensitive demo content only.
          </section>
        )}

        <label htmlFor="editMemoryTags">Record tags</label>
        <input
          id="editMemoryTags"
          name="editMemoryTags"
          value={form.tags}
          disabled={recordUpdate.status === "submitting"}
          aria-describedby={formErrors.tags ? "editMemoryTags-error" : undefined}
          onChange={(event) => onFormChange({ ...form, tags: event.target.value })}
        />
        {formErrors.tags && (
          <p className="field-error" id="editMemoryTags-error">
            {formErrors.tags}
          </p>
        )}

        <label htmlFor="editMemorySource">Record source</label>
        <input
          id="editMemorySource"
          name="editMemorySource"
          value={form.source}
          disabled={recordUpdate.status === "submitting"}
          aria-describedby={formErrors.source ? "editMemorySource-error" : undefined}
          onChange={(event) => onFormChange({ ...form, source: event.target.value })}
        />
        {formErrors.source && (
          <p className="field-error" id="editMemorySource-error">
            {formErrors.source}
          </p>
        )}

        <label className="required-label" htmlFor="editMemoryImportance">
          Record importance
        </label>
        <select
          id="editMemoryImportance"
          value={form.importance}
          disabled={recordUpdate.status === "submitting"}
          aria-describedby={formErrors.importance ? "editMemoryImportance-error" : undefined}
          onChange={(event) =>
            onFormChange({
              ...form,
              importance: event.target.value as MemoryRecordFormInput["importance"],
            })
          }
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        {formErrors.importance && (
          <p className="field-error" id="editMemoryImportance-error">
            {formErrors.importance}
          </p>
        )}

        {!form.encryptionEnabled && (
          <>
            <label className="checkbox-row required-label" htmlFor="editPublicTestnetAcknowledged">
              <input
                id="editPublicTestnetAcknowledged"
                type="checkbox"
                checked={form.publicTestnetAcknowledged}
                disabled={recordUpdate.status === "submitting"}
                aria-describedby={formErrors.publicTestnetAcknowledged ? "editPublicTestnetAcknowledged-error" : undefined}
                onChange={(event) => onFormChange({ ...form, publicTestnetAcknowledged: event.target.checked })}
              />
              <span>I understand this updated memory body may be public on Braga testnet.</span>
            </label>
            {formErrors.publicTestnetAcknowledged && (
              <p className="field-error" id="editPublicTestnetAcknowledged-error">
                {formErrors.publicTestnetAcknowledged}
              </p>
            )}
          </>
        )}

        <div className="mutation-actions">
          <button className="primary-action" type="submit" disabled={recordUpdate.status === "submitting"}>
            {recordUpdate.status === "submitting" ? "Updating memory" : "Update memory"}
          </button>
          <button
            className="danger-action"
            type="button"
            disabled={recordDelete.status === "submitting"}
            onClick={onDelete}
          >
            {recordDelete.status === "submitting" ? "Deleting memory" : "Delete memory"}
          </button>
        </div>

        <p className={`operation-message ${recordUpdate.status}`} role="status">
          {recordUpdate.message}
        </p>
        {recordUpdate.status === "success" && <ReceiptGrid entityKey={recordUpdate.entityKey} txHash={recordUpdate.txHash} />}
      </form>

      <p className={`operation-message ${recordDelete.status}`} role="status">
        {recordDelete.message}
      </p>
      {recordDelete.status === "success" && <ReceiptGrid entityKey={recordDelete.entityKey} txHash={recordDelete.txHash} />}
    </section>
  );
}

interface EntityDetailPopoverProps {
  entity: MemoryProfile | MemoryRecord | null;
  explorerUrl: string;
  extraContent?: ReactNode;
  headerActions?: ReactNode;
  heading: string;
  label: string;
  message: string;
  onClose: () => void;
  status: string;
}

function EntityDetailPopover({
  entity,
  explorerUrl,
  extraContent,
  headerActions,
  heading,
  label,
  message,
  onClose,
  status,
}: EntityDetailPopoverProps) {
  return (
    <div className="inspect-overlay" role="presentation" onClick={onClose}>
      <section
        aria-labelledby={`${heading.toLowerCase().replace(/\s+/g, "-")}-title`}
        aria-modal="true"
        className="inspect-popover"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{label}</p>
            <h2 id={`${heading.toLowerCase().replace(/\s+/g, "-")}-title`}>{heading}</h2>
          </div>
          <div className="row-actions">
            {headerActions}
            <a className="secondary-link" href={explorerUrl}>
              Explorer
            </a>
            <button className="icon-action" type="button" aria-label="Close inspector" onClick={onClose}>
              x
            </button>
          </div>
        </div>

        <p className={`operation-message ${status}`} role="status">
          {message}
        </p>

        {entity && (
          <div className="detail-grid">
            <dl>
              <div>
                <dt>Entity key</dt>
                <dd>{entity.entityKey}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{entity.ownerAddress ?? "Not returned"}</dd>
              </div>
              <div>
                <dt>Creator</dt>
                <dd>{entity.creatorAddress ?? "Not returned"}</dd>
              </div>
              <div>
                <dt>Created block</dt>
                <dd>{formatBlock(entity.createdAtBlock)}</dd>
              </div>
              <div>
                <dt>Expires block</dt>
                <dd>{formatBlock(entity.expiresAtBlock)}</dd>
              </div>
            </dl>
            <pre>{JSON.stringify(entity.payload, null, 2)}</pre>
          </div>
        )}
        {extraContent}
      </section>
    </div>
  );
}

interface RecordDecryptPanelProps {
  decryptState: LoadState & { body: string | null };
  disabled: boolean;
  onClear: () => void;
  onDecrypt: () => void;
  onPassphraseChange: (passphrase: string) => void;
  passphrase: string;
}

function RecordDecryptPanel({
  decryptState,
  disabled,
  onClear,
  onDecrypt,
  onPassphraseChange,
  passphrase,
}: RecordDecryptPanelProps) {
  return (
    <section className="decrypt-panel" aria-label="Encrypted memory body decrypt">
      <label htmlFor="decryptMemoryPassphrase">Decryption passphrase</label>
      <div className="filter-controls">
        <input
          id="decryptMemoryPassphrase"
          type="password"
          autoComplete="off"
          value={passphrase}
          disabled={disabled}
          onChange={(event) => onPassphraseChange(event.target.value)}
        />
        <button className="secondary-action" type="button" disabled={disabled} onClick={onDecrypt}>
          {decryptState.status === "loading" ? "Decrypting" : "Decrypt body"}
        </button>
        <button className="secondary-action" type="button" disabled={disabled || !decryptState.body} onClick={onClear}>
          Clear
        </button>
      </div>
      <p className={`operation-message ${decryptState.status}`} role="status">
        {decryptState.message}
      </p>
      {decryptState.body && <pre className="decrypted-body">{decryptState.body}</pre>}
    </section>
  );
}

function DiagnosticsReport({ result }: { result: ArkivMutationDiagnosticsResult }) {
  return (
    <div className="diagnostic-report">
      <dl className="diagnostic-meta" aria-label="Diagnostic transaction metadata">
        <div>
          <dt>RPC URL</dt>
          <dd>{result.rpcUrl}</dd>
        </div>
        <div>
          <dt>From</dt>
          <dd>{result.fromAddress}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{result.toAddress}</dd>
        </div>
        <div>
          <dt>Bytes</dt>
          <dd>
            RLP {result.txDataBytes}, Brotli {result.compressedDataBytes}
          </dd>
        </div>
      </dl>

      <ul className="diagnostic-list" aria-label="Diagnostic checks">
        {result.checks.map((check) => (
          <li className={`diagnostic-check ${check.status}`} key={check.id}>
            <strong>{check.label}</strong>
            <span>{check.status === "success" ? "Pass" : "Fail"}</span>
            <code>{check.detail}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function getFirstWalletAddress(accounts: unknown): string | null {
  return Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation failed.";
}

function getMutationErrorMessage(error: unknown, operation: string): string {
  const message = getErrorMessage(error);

  if (isArkivTransactionDecompressionFailure(message)) {
    return `${operation} failed before Braga accepted the transaction. The current Braga RPC accepts locally encoded Arkiv transactions, so MetaMask is likely still broadcasting through a stale Arkiv Braga network entry. In MetaMask, edit or remove and re-add Arkiv Braga Testnet with RPC URL ${BRAGA_RPC_URL}, then reconnect and retry. Form data was kept for retry.`;
  }

  if (isAuthorizationFailureMessage(message)) {
    return `${operation} authorization failed: the connected wallet is not the Arkiv $owner for this entity. Form data was kept for retry.`;
  }

  return message;
}

function getMutationFailureState(error: unknown, operation: string): CreateState {
  const message = getErrorMessage(error);

  if (isLikelyPendingTransactionMessage(message)) {
    return {
      status: "pending",
      message: `${operation} was broadcast but confirmation is still pending on Braga testnet. Check MetaMask Activity and Arkiv Explorer, then refresh this section after confirmation.`,
    };
  }

  return { status: "error", message: getMutationErrorMessage(error, operation) };
}

function isAuthorizationFailureMessage(message: string): boolean {
  return /\$owner|not.*owner|owner.*not|unauthori[sz]ed|forbidden/i.test(message);
}

function isArkivTransactionDecompressionFailure(message: string): boolean {
  return /decompress.*arkiv transaction data|brotli|PADDING_2/i.test(message);
}

function isLikelyPendingTransactionMessage(message: string): boolean {
  return /pending|not.*confirmed|not.*mined|receipt.*not.*found|timed?\s*out|timeout|wait.*transaction/i.test(message);
}

function getDiagnosticsMessage(result: ArkivMutationDiagnosticsResult): string {
  const directAccepted = isDiagnosticCheckSuccessful(result, "direct-call") && isDiagnosticCheckSuccessful(result, "direct-estimate-gas");
  const walletRejected = isDiagnosticCheckFailed(result, "wallet-call") || isDiagnosticCheckFailed(result, "wallet-estimate-gas");

  if (directAccepted && walletRejected) {
    return "Diagnostics isolate the failure to the MetaMask provider path: direct Braga accepts the same encoded transaction.";
  }

  if (!directAccepted) {
    return "Diagnostics show the direct Braga RPC rejected or could not test the encoded transaction.";
  }

  return "Diagnostics show direct Braga and MetaMask provider preflight both accept the encoded transaction.";
}

function isDiagnosticCheckSuccessful(result: ArkivMutationDiagnosticsResult, id: string): boolean {
  return result.checks.some((check) => check.id === id && check.status === "success");
}

function isDiagnosticCheckFailed(result: ArkivMutationDiagnosticsResult, id: string): boolean {
  return result.checks.some((check) => check.id === id && check.status === "error");
}

function isEntityOwnedBy(entity: MemoryProfile | MemoryRecord, ownerAddress: string | null): boolean {
  return Boolean(entity.ownerAddress && ownerAddress && entity.ownerAddress.toLowerCase() === ownerAddress.toLowerCase());
}

function ownerMismatchMessage(kind: string, entity: MemoryProfile | MemoryRecord, ownerAddress: string): string {
  return `Authorization failed: selected ${kind} is owned by ${entity.ownerAddress ?? "an unknown Arkiv $owner"}, not connected wallet ${ownerAddress}.`;
}

function getSelectedRecordUpdateMessage(record: MemoryRecord, ownerAddress: string | null): string {
  if (!isEntityOwnedBy(record, ownerAddress)) {
    return "Authorization failed: selected memory record owner does not match the connected wallet.";
  }

  if (isEncryptedMemoryRecord(record)) {
    return "Encrypted memory record selected but locked. Decrypt from detail to view it, or enter a replacement body and passphrase to update.";
  }

  return "Edit fields are loaded from the selected Arkiv memory record.";
}

function formatBlock(block: bigint | undefined): string {
  return block === undefined ? "Not returned" : block.toString();
}

function shortenHex(value: string): string {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
  function buildMemorySourceValue(method: MemoryCaptureMethod, otherText: string): string {
    return method === OTHER_CAPTURE_METHOD ? otherText.trim() : method;
  }

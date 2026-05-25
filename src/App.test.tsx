import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toHex, type Hash, type Hex } from "@arkiv-network/sdk";

import { App } from "./App";
import { BRAGA_CHAIN_ID, BRAGA_RPC_URL, CONTENT_TYPE_JSON } from "./lib/arkiv/contract";
import { MEMORY_BODY_ENCRYPTION_SCHEME } from "./lib/crypto/memoryEncryption";
import {
  MemoryProfileValidationError,
  createMemoryProfileDraftFromInput,
  createMemoryProfileUpdateDraftFromInput,
  type MemoryProfile,
  type MemoryProfileRepository,
} from "./lib/arkiv/profiles";
import {
  MemoryRecordValidationError,
  createMemoryRecordDraftFromInput,
  createMemoryRecordUpdateDraftFromInput,
  type MemoryRecord,
  type MemoryRecordRepository,
} from "./lib/arkiv/records";
import type { ArkivMutationDiagnosticsResult } from "./lib/arkiv/wallet";

const ownerAddress = "0x5056A091A9674EB1bDFcE49a689b175Bd69E81A2";
const profileEntityKey = `0x${"a".repeat(64)}` as Hex;
const recordEntityKey = `0x${"c".repeat(64)}` as Hex;
const txHash = `0x${"b".repeat(64)}` as Hash;
const recordTxHash = `0x${"d".repeat(64)}` as Hash;
const now = new Date("2026-05-23T00:00:00.000Z");

afterEach(() => {
  Reflect.deleteProperty(window, "ethereum");
  vi.restoreAllMocks();
});

describe("App profile workflow", () => {
  it("renders the usable Arkiv memory workspace", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "[Arkiv Lantern]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect with MetaMask/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "A four-step Arkiv memory flow" })).not.toBeInTheDocument();
    expect(screen.getByText(/Connect with Metamask to scope Arkiv profiles/i)).toBeInTheDocument();
    expect(screen.getByText("Create or select profile")).toBeInTheDocument();
    expect(screen.getByText("Save memory")).toBeInTheDocument();
    expect(screen.getByText("Retrieve and manage")).toBeInTheDocument();
    expect(screen.getByText("Arkiv contract, diagnostics, and network details")).toBeInTheDocument();
    expect(screen.queryByText("Profile tools")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Memory detail" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/arkiv-database-owned-memory-v1/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Create profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create memory" })).toBeDisabled();
  });

  it("connects a wallet and shows profile and memory empty states", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([]);
    const recordRepository = createRecordRepository([]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));

    expect(await screen.findByText("No memory profiles returned for this owner.")).toBeInTheDocument();
    expect(screen.getByText("No profile yet. Create one above, then use it to save memories.")).toBeInTheDocument();
    expect(screen.getByText("Select a profile before retrieving memories.")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`ownerAddress = "${ownerAddress}"`))).toBeInTheDocument();
    expect(profileRepository.listProfiles).toHaveBeenCalledWith({ ownerAddress });
    expect(recordRepository.listRecords).not.toHaveBeenCalled();
  });

  it("shows profile validation errors from the repository", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([]);
    const recordRepository = createRecordRepository([]);
    vi.mocked(profileRepository.createProfile).mockRejectedValueOnce(
      new MemoryProfileValidationError({
        agentPurpose: "Agent purpose is required.",
        displayName: "Display name is required.",
      }),
    );

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory profiles returned for this owner.");

    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    expect(await screen.findByText("Display name is required.")).toBeInTheDocument();
    expect(screen.getByText("Agent purpose is required.")).toBeInTheDocument();
    expect(screen.getByText("Fix the profile fields before submitting.")).toBeInTheDocument();
  });

  it("explains Arkiv Brotli transaction failures and keeps profile form data visible", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([]);
    const recordRepository = createRecordRepository([]);
    vi.mocked(profileRepository.createProfile).mockRejectedValueOnce(
      new Error("Transaction failed: RPC submit: failed to decompress arkiv transaction data: brotli: PADDING_2"),
    );

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory profiles returned for this owner.");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Jarrett" } });
    fireEvent.change(screen.getByLabelText("Agent purpose"), { target: { value: "Step 1: Create Agent" } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    expect(await screen.findByText(/Profile create failed before Braga accepted the transaction/i)).toBeInTheDocument();
    expect(screen.getByText(/MetaMask is likely still broadcasting through a stale Arkiv Braga network entry/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(BRAGA_RPC_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jarrett")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Step 1: Create Agent")).toBeInTheDocument();
  });

  it("runs non-mutating write diagnostics against the current profile draft", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([]);
    const recordRepository = createRecordRepository([]);
    const runProfileCreateDiagnostics = vi.fn(async () => createDiagnosticsResult());

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
        runProfileCreateDiagnostics={runProfileCreateDiagnostics}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory profiles returned for this owner.");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Jarrett" } });
    fireEvent.change(screen.getByLabelText("Agent purpose"), { target: { value: "Debug Braga writes" } });
    openAdvancedPanel();
    fireEvent.click(screen.getByRole("button", { name: "Run write diagnostics" }));

    expect(await screen.findByText(/Diagnostics isolate the failure to the MetaMask provider path/i)).toBeInTheDocument();
    expect(screen.getByText("Direct Braga eth_estimateGas")).toBeInTheDocument();
    expect(screen.getByText("MetaMask provider eth_estimateGas")).toBeInTheDocument();
    expect(screen.getAllByText(/failed to decompress arkiv transaction data/i).length).toBeGreaterThan(0);
    expect(profileRepository.createProfile).not.toHaveBeenCalled();
    expect(runProfileCreateDiagnostics).toHaveBeenCalledWith(
      window.ethereum,
      ownerAddress,
      expect.objectContaining({
        payload: expect.objectContaining({
          agentPurpose: "Debug Braga writes",
          displayName: "Jarrett",
        }),
      }),
    );
  });

  it("validates profile fields before running write diagnostics", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([]);
    const recordRepository = createRecordRepository([]);
    const runProfileCreateDiagnostics = vi.fn(async () => createDiagnosticsResult());

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
        runProfileCreateDiagnostics={runProfileCreateDiagnostics}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory profiles returned for this owner.");

    openAdvancedPanel();
    fireEvent.click(screen.getByRole("button", { name: "Run write diagnostics" }));

    expect(await screen.findByText("Display name is required.")).toBeInTheDocument();
    expect(screen.getByText("Agent purpose is required.")).toBeInTheDocument();
    expect(screen.getByText("Fix the profile fields before running write diagnostics.")).toBeInTheDocument();
    expect(runProfileCreateDiagnostics).not.toHaveBeenCalled();
  });

  it("creates, refreshes, and reads a profile through the injected repository", async () => {
    installEthereumProvider();
    const profile = createProfile();
    const profileRepository = createProfileRepository([]);
    const recordRepository = createRecordRepository([]);
    let queriedProfiles: MemoryProfile[] = [];

    vi.mocked(profileRepository.listProfiles).mockImplementation(async () => queriedProfiles);
    vi.mocked(profileRepository.createProfile).mockImplementation(async (input) => {
      queriedProfiles = [profile];
      return {
        draft: createMemoryProfileDraftFromInput({ input, now: () => now }),
        entityKey: profileEntityKey,
        txHash,
      };
    });
    vi.mocked(profileRepository.readProfile).mockResolvedValue(profile);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory profiles returned for this owner.");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Research Agent" } });
    fireEvent.change(screen.getByLabelText("Agent purpose"), {
      target: { value: "Remember user-owned research context" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Demo notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    expect(await screen.findByText("Profile transaction confirmed on Arkiv Braga.")).toBeInTheDocument();
    expect(screen.getByText("Profile entity loaded by key.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Research Agent" })).toBeInTheDocument();
    expect(screen.getAllByText(profileEntityKey).length).toBeGreaterThan(0);
    expect(profileRepository.createProfile).toHaveBeenCalledWith({
      agentPurpose: "Remember user-owned research context",
      displayName: "Research Agent",
      notes: "Demo notes",
      ownerAddress,
    });
    expect(profileRepository.readProfile).toHaveBeenCalledWith({ entityKey: profileEntityKey });
  });

  it("opens profile detail when inspecting a profile", async () => {
    installEthereumProvider();
    const profile = createProfile();
    const profileRepository = createProfileRepository([profile]);
    const recordRepository = createRecordRepository([]);
    vi.mocked(profileRepository.readProfile).mockResolvedValue(profile);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByRole("heading", { name: "Research Agent" });

    fireEvent.click(within(screen.getByRole("region", { name: "Choose a profile" })).getByRole("button", { name: "Inspect" }));

    expect(await screen.findByText("Profile entity loaded by key.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Profile detail" })).toBeInTheDocument();
    expect(profileRepository.readProfile).toHaveBeenCalledWith({ entityKey: profileEntityKey });
  });

  it("closes the inspect popover from the close button", async () => {
    installEthereumProvider();
    const profile = createProfile();
    const profileRepository = createProfileRepository([profile]);
    const recordRepository = createRecordRepository([]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByRole("heading", { name: "Research Agent" });

    fireEvent.click(within(screen.getByRole("region", { name: "Choose a profile" })).getByRole("button", { name: "Inspect" }));
    await screen.findByRole("dialog", { name: "Profile detail" });
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));

    expect(screen.queryByRole("dialog", { name: "Profile detail" })).not.toBeInTheDocument();
  });

  it("shows profile update validation errors from the repository", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const recordRepository = createRecordRepository([]);
    vi.mocked(profileRepository.updateProfile).mockRejectedValueOnce(
      new MemoryProfileValidationError({
        displayName: "Display name is required.",
      }),
    );

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await openProfileInspectorEditor();

    fireEvent.click(screen.getByRole("button", { name: "Update profile" }));

    expect(await screen.findByText("Display name is required.")).toBeInTheDocument();
    expect(screen.getByText("Fix the profile edit fields before updating.")).toBeInTheDocument();
  });

  it("updates a selected profile and refreshes owner-scoped data", async () => {
    installEthereumProvider();
    let queriedProfiles = [createProfile()];
    const profileRepository = createProfileRepository(queriedProfiles);
    const recordRepository = createRecordRepository([]);

    vi.mocked(profileRepository.listProfiles).mockImplementation(async () => queriedProfiles);
    vi.mocked(profileRepository.updateProfile).mockImplementation(async (input) => {
      queriedProfiles = [
        {
          ...input.profile,
          payload: {
            ...input.profile.payload,
            agentPurpose: input.agentPurpose,
            displayName: input.displayName,
            notes: input.notes,
            updatedAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
          },
        },
      ];
      return {
        draft: createMemoryProfileUpdateDraftFromInput({ input, now: () => new Date("2026-05-24T00:00:00.000Z") }),
        entityKey: input.profile.entityKey,
        txHash,
      };
    });
    vi.mocked(profileRepository.readProfile).mockImplementation(async () => queriedProfiles[0]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await openProfileInspectorEditor();

    fireEvent.change(screen.getByLabelText("Profile display name"), { target: { value: "Research Agent Prime" } });
    fireEvent.change(screen.getByLabelText("Profile agent purpose"), {
      target: { value: "Remember updated user-owned research context" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update profile" }));

    await waitFor(() => expect(profileRepository.updateProfile).toHaveBeenCalled());
    expect(await screen.findByText("Profile update transaction confirmed on Arkiv Braga.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Research Agent Prime" })).toBeInTheDocument();
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPurpose: "Remember updated user-owned research context",
        displayName: "Research Agent Prime",
        ownerAddress,
        profile: expect.objectContaining({ entityKey: profileEntityKey }),
      }),
    );
    expect(profileRepository.listProfiles).toHaveBeenLastCalledWith({ ownerAddress });
  });

  it("deletes a selected profile after explicit confirmation", async () => {
    installEthereumProvider();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    let queriedProfiles = [createProfile()];
    const profileRepository = createProfileRepository(queriedProfiles);
    const recordRepository = createRecordRepository([]);

    vi.mocked(profileRepository.listProfiles).mockImplementation(async () => queriedProfiles);
    vi.mocked(profileRepository.deleteProfile).mockImplementation(async (input) => {
      queriedProfiles = [];
      return { entityKey: input.profile.entityKey, txHash };
    });

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await openProfileInspectorEditor();

    fireEvent.click(screen.getByRole("button", { name: "Delete profile" }));

    expect(await screen.findByText("Profile delete transaction confirmed on Arkiv Braga.")).toBeInTheDocument();
    expect(screen.getByText("No memory profiles returned for this owner.")).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith('Delete profile "Research Agent" from Arkiv Braga?');
    expect(profileRepository.deleteProfile).toHaveBeenCalledWith({
      ownerAddress,
      profile: expect.objectContaining({ entityKey: profileEntityKey }),
    });
  });
});

describe("App memory record workflow", () => {
  it("shows create-memory validation errors from the repository", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const recordRepository = createRecordRepository([]);
    vi.mocked(recordRepository.createRecord).mockRejectedValueOnce(
      new MemoryRecordValidationError({
        body: "Body is required.",
        publicTestnetAcknowledged: "Acknowledge the public Braga testnet warning before submitting.",
        title: "Title is required.",
      }),
    );

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory records returned for selected profile.");

    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Body is required.")).toBeInTheDocument();
    expect(screen.getByText("Acknowledge the public Braga testnet warning before submitting.")).toBeInTheDocument();
    expect(screen.getByText("Fix the memory fields before submitting.")).toBeInTheDocument();
  });

  it("creates, refreshes, and reads a memory record through the injected repository", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const record = createMemoryRecord();
    const recordRepository = createRecordRepository([]);
    let queriedRecords: MemoryRecord[] = [];

    vi.mocked(recordRepository.listRecords).mockImplementation(async () => queriedRecords);
    vi.mocked(recordRepository.createRecord).mockImplementation(async (input) => {
      queriedRecords = [record];
      return {
        draft: await createMemoryRecordDraftFromInput({ input, now: () => now }),
        entityKey: recordEntityKey,
        txHash: recordTxHash,
      };
    });
    vi.mocked(recordRepository.readRecord).mockResolvedValue(record);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory records returned for selected profile.");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Style preference" } });
    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: "The user prefers concise implementation notes." },
    });
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "Preference, Research" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "manual" } });
    fireEvent.click(screen.getByLabelText(/I understand this memory body may be public/i));
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(await screen.findByText("Memory record transaction confirmed on Arkiv Braga.")).toBeInTheDocument();
    expect(screen.getByText("Memory record entity loaded by key.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Style preference" })).toBeInTheDocument();
    expect(screen.getAllByText(recordEntityKey).length).toBeGreaterThan(0);
    expect(recordRepository.createRecord).toHaveBeenCalledWith({
      body: "The user prefers concise implementation notes.",
      encryptionEnabled: false,
      encryptionPassphrase: "",
      importance: "medium",
      ownerAddress,
      profileEntityKey,
      publicTestnetAcknowledged: true,
      source: "manual",
      tags: "Preference, Research",
      title: "Style preference",
    });
    expect(recordRepository.readRecord).toHaveBeenCalledWith({ entityKey: recordEntityKey });
  });

  it("validates encrypted memory create passphrase input", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const recordRepository = createRecordRepository([]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory records returned for selected profile.");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Encrypted style preference" } });
    fireEvent.click(screen.getByLabelText("Encrypt memory body with a passphrase"));
    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: "The user prefers private implementation notes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(await screen.findByText("Passphrase is required to encrypt this memory body.")).toBeInTheDocument();
    expect(screen.getByText("Fix the memory fields before submitting.")).toBeInTheDocument();
    expect(recordRepository.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptionEnabled: true,
        encryptionPassphrase: "",
        publicTestnetAcknowledged: false,
      }),
    );
  });

  it("creates an encrypted memory record without requiring plaintext public acknowledgement", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const encryptedRecord = createEncryptedMemoryRecord();
    const recordRepository = createRecordRepository([]);
    let queriedRecords: MemoryRecord[] = [];

    vi.mocked(recordRepository.listRecords).mockImplementation(async () => queriedRecords);
    vi.mocked(recordRepository.createRecord).mockImplementation(async () => {
      queriedRecords = [encryptedRecord];
      return {
        draft: {
          attributes: encryptedRecord.attributes.map((attribute) => ({
            key: attribute.key,
            value: String(attribute.value),
          })),
          contentType: CONTENT_TYPE_JSON,
          expiresIn: 31_536_000,
          payload: encryptedRecord.payload,
        },
        entityKey: recordEntityKey,
        txHash: recordTxHash,
      };
    });
    vi.mocked(recordRepository.readRecord).mockResolvedValue(encryptedRecord);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory records returned for selected profile.");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Encrypted style preference" } });
    fireEvent.click(screen.getByLabelText("Encrypt memory body with a passphrase"));
    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: "The user prefers private implementation notes." },
    });
    fireEvent.change(screen.getByLabelText("Encryption passphrase"), {
      target: { value: "memory passphrase" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "Preference, Private" } });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(await screen.findByText("Encrypted memory record transaction confirmed on Arkiv Braga.")).toBeInTheDocument();
    expect(screen.getByText("Memory record entity loaded by key.")).toBeInTheDocument();
    expect(screen.getAllByText("Encrypted body locked").length).toBeGreaterThan(0);
    expect(recordRepository.createRecord).toHaveBeenCalledWith({
      body: "The user prefers private implementation notes.",
      encryptionEnabled: true,
      encryptionPassphrase: "memory passphrase",
      importance: "medium",
      ownerAddress,
      profileEntityKey,
      publicTestnetAcknowledged: false,
      source: "",
      tags: "Preference, Private",
      title: "Encrypted style preference",
    });
  });

  it("shows encrypted records as locked before decrypt", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const recordRepository = createRecordRepository([createEncryptedMemoryRecord()]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));

    expect(await screen.findByRole("heading", { name: "Encrypted style preference" })).toBeInTheDocument();
    expect(screen.getAllByText(/Encrypted body locked/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Encrypted memory record selected but locked/i)).toBeInTheDocument();
    expect(screen.queryByText("The user prefers private implementation notes.")).not.toBeInTheDocument();
  });

  it("decrypts an encrypted record body after explicit user action", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const encryptedRecord = createEncryptedMemoryRecord();
    const recordRepository = createRecordRepository([encryptedRecord]);
    const decryptRecordBody = vi.fn(async () => "The user prefers private implementation notes.");

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
        decryptRecordBody={decryptRecordBody}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByRole("heading", { name: "Encrypted style preference" });

    fireEvent.click(
      within(screen.getByRole("region", { name: "Retrieve memories" })).getByRole("button", { name: "Inspect" }),
    );
    await screen.findByText("Encrypted memory record loaded but locked. Passphrase required to decrypt the body.");
    fireEvent.change(screen.getByLabelText("Decryption passphrase"), {
      target: { value: "memory passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decrypt body" }));

    expect(await screen.findByText("Memory body decrypted in this browser session.")).toBeInTheDocument();
    expect(screen.getByText("The user prefers private implementation notes.")).toBeInTheDocument();
    expect(decryptRecordBody).toHaveBeenCalledWith(encryptedRecord, "memory passphrase");
  });

  it("shows wrong-passphrase decryption failure and keeps the encrypted record selected", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const encryptedRecord = createEncryptedMemoryRecord();
    const recordRepository = createRecordRepository([encryptedRecord]);
    const decryptRecordBody = vi.fn(async () => {
      throw new Error("Passphrase could not decrypt this memory body.");
    });

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
        decryptRecordBody={decryptRecordBody}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByRole("heading", { name: "Encrypted style preference" });

    fireEvent.click(
      within(screen.getByRole("region", { name: "Retrieve memories" })).getByRole("button", { name: "Inspect" }),
    );
    await screen.findByText("Encrypted memory record loaded but locked. Passphrase required to decrypt the body.");
    fireEvent.change(screen.getByLabelText("Decryption passphrase"), {
      target: { value: "wrong passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decrypt body" }));

    expect(await screen.findByText(/Decryption failed: Passphrase could not decrypt this memory body/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Encrypted style preference" })).toBeInTheDocument();
    expect(screen.getAllByText(recordEntityKey).length).toBeGreaterThan(0);
  });

  it("shows memory record update validation errors from the repository", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const recordRepository = createRecordRepository([createMemoryRecord()]);
    vi.mocked(recordRepository.updateRecord).mockRejectedValueOnce(
      new MemoryRecordValidationError({
        body: "Body is required.",
        publicTestnetAcknowledged: "Acknowledge the public Braga testnet warning before submitting.",
        title: "Title is required.",
      }),
    );

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("Edit fields are loaded from the selected Arkiv memory record.");

    fireEvent.click(screen.getByRole("button", { name: "Update memory" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Body is required.")).toBeInTheDocument();
    expect(screen.getByText("Acknowledge the public Braga testnet warning before submitting.")).toBeInTheDocument();
    expect(screen.getByText("Fix the memory edit fields before updating.")).toBeInTheDocument();
  });

  it("updates a selected memory record and refreshes profile-scoped data", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    let queriedRecords = [createMemoryRecord()];
    const recordRepository = createRecordRepository(queriedRecords);

    vi.mocked(recordRepository.listRecords).mockImplementation(async () => queriedRecords);
    vi.mocked(recordRepository.updateRecord).mockImplementation(async (input) => {
      queriedRecords = [
        {
          ...input.record,
          payload: {
            body: input.body,
            createdAt: input.record.payload.createdAt,
            importance: input.importance,
            profileEntityKey: input.record.payload.profileEntityKey,
            schemaVersion: "1",
            ...(input.source ? { source: input.source } : {}),
            tags: ["preference", "release-notes"],
            title: input.title,
            updatedAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
          },
        },
      ];
      return {
        draft: await createMemoryRecordUpdateDraftFromInput({
          input,
          now: () => new Date("2026-05-24T00:00:00.000Z"),
        }),
        entityKey: input.record.entityKey,
        txHash: recordTxHash,
      };
    });
    vi.mocked(recordRepository.readRecord).mockImplementation(async () => queriedRecords[0]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("Edit fields are loaded from the selected Arkiv memory record.");

    fireEvent.change(screen.getByLabelText("Record title"), { target: { value: "Updated style preference" } });
    fireEvent.change(screen.getByLabelText("Record body"), {
      target: { value: "The user now prefers detailed release notes." },
    });
    fireEvent.change(screen.getByLabelText("Record tags"), { target: { value: "Preference, Release Notes" } });
    fireEvent.click(screen.getByLabelText(/I understand this updated memory body may be public/i));
    fireEvent.click(screen.getByRole("button", { name: "Update memory" }));

    expect(await screen.findByText("Memory record update transaction confirmed on Arkiv Braga.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Updated style preference" })).toBeInTheDocument();
    expect(recordRepository.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "The user now prefers detailed release notes.",
        ownerAddress,
        publicTestnetAcknowledged: true,
        record: expect.objectContaining({ entityKey: recordEntityKey }),
        tags: "Preference, Release Notes",
        title: "Updated style preference",
      }),
    );
    expect(recordRepository.listRecords).toHaveBeenLastCalledWith({
      ownerAddress,
      profileEntityKey,
      tag: undefined,
    });
  });

  it("deletes a selected memory record after explicit confirmation", async () => {
    installEthereumProvider();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const profileRepository = createProfileRepository([createProfile()]);
    let queriedRecords = [createMemoryRecord()];
    const recordRepository = createRecordRepository(queriedRecords);

    vi.mocked(recordRepository.listRecords).mockImplementation(async () => queriedRecords);
    vi.mocked(recordRepository.deleteRecord).mockImplementation(async (input) => {
      queriedRecords = [];
      return { entityKey: input.record.entityKey, txHash: recordTxHash };
    });

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("Edit fields are loaded from the selected Arkiv memory record.");

    fireEvent.click(screen.getByRole("button", { name: "Delete memory" }));

    expect(await screen.findByText("Memory record delete transaction confirmed on Arkiv Braga.")).toBeInTheDocument();
    expect(screen.getByText("No memory records returned for selected profile.")).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith('Delete memory record "Style preference" from Arkiv Braga?');
    expect(recordRepository.deleteRecord).toHaveBeenCalledWith({
      ownerAddress,
      record: expect.objectContaining({ entityKey: recordEntityKey }),
    });
  });

  it("shows authorization failures for rejected update and delete attempts without clearing form data", async () => {
    installEthereumProvider();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const profileRepository = createProfileRepository([createProfile()]);
    const recordRepository = createRecordRepository([createMemoryRecord()]);
    vi.mocked(profileRepository.updateProfile).mockRejectedValueOnce(new Error("Arkiv rejected update: caller is not $owner."));
    vi.mocked(recordRepository.deleteRecord).mockRejectedValueOnce(new Error("Arkiv rejected delete: caller is not $owner."));

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("Edit fields are loaded from the selected Arkiv memory record.");
    await openProfileInspectorEditor();

    fireEvent.change(screen.getByLabelText("Profile display name"), { target: { value: "Retryable profile edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Update profile" }));

    expect(await screen.findByText(/Profile update authorization failed/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Retryable profile edit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete memory" }));

    expect(await screen.findByText(/Memory record delete authorization failed/i)).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith('Delete memory record "Style preference" from Arkiv Braga?');
  });

  it("queries memory records by tag through the repository", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const recordRepository = createRecordRepository([]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByText("No memory records returned for selected profile.");

    fireEvent.change(screen.getByLabelText("Tag filter"), { target: { value: "Project Context" } });
    fireEvent.click(screen.getByRole("button", { name: "Query tag" }));

    await waitFor(() => {
      expect(recordRepository.listRecords).toHaveBeenLastCalledWith({
        ownerAddress,
        profileEntityKey,
        tag: "Project Context",
      });
    });
    expect(screen.getByText(/tag = "project-context"/)).toBeInTheDocument();
  });

  it("renders record detail payload and metadata", async () => {
    installEthereumProvider();
    const profileRepository = createProfileRepository([createProfile()]);
    const record = createMemoryRecord();
    const recordRepository = createRecordRepository([record]);

    render(
      <App
        createProfileRepository={() => profileRepository}
        createRecordRepository={() => recordRepository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect with MetaMask/i }));
    await screen.findByRole("heading", { name: "Style preference" });

    fireEvent.click(
      within(screen.getByRole("region", { name: "Retrieve memories" })).getByRole("button", { name: "Inspect" }),
    );

    expect(await screen.findByText("Memory record entity loaded by key.")).toBeInTheDocument();
    expect(screen.getAllByText(ownerAddress).length).toBeGreaterThan(0);
    expect(screen.getAllByText(recordEntityKey).length).toBeGreaterThan(0);
    expect(screen.getByText(/"profileEntityKey"/)).toBeInTheDocument();
    expect(screen.getByText(/"body": "The user prefers concise implementation notes."/)).toBeInTheDocument();
  });
});

function installEthereumProvider() {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_requestAccounts") {
      return [ownerAddress];
    }

    if (method === "eth_chainId") {
      return toHex(BRAGA_CHAIN_ID);
    }

    return null;
  });

  Object.defineProperty(window, "ethereum", {
    configurable: true,
    value: { request },
  });

  return request;
}

function createProfileRepository(initialProfiles: MemoryProfile[]): MemoryProfileRepository {
  return {
    createProfile: vi.fn(async (input) => ({
      draft: createMemoryProfileDraftFromInput({ input, now: () => now }),
      entityKey: profileEntityKey,
      txHash,
    })),
    deleteProfile: vi.fn(async () => ({
      entityKey: profileEntityKey,
      txHash,
    })),
    listProfiles: vi.fn(async () => initialProfiles),
    readProfile: vi.fn(async () => initialProfiles[0] ?? createProfile()),
    updateProfile: vi.fn(async (input) => ({
      draft: createMemoryProfileUpdateDraftFromInput({ input, now: () => now }),
      entityKey: profileEntityKey,
      txHash,
    })),
  };
}

function createRecordRepository(initialRecords: MemoryRecord[]): MemoryRecordRepository {
  return {
    createRecord: vi.fn(async (input) => ({
      draft: await createMemoryRecordDraftFromInput({ input, now: () => now }),
      entityKey: recordEntityKey,
      txHash: recordTxHash,
    })),
    deleteRecord: vi.fn(async () => ({
      entityKey: recordEntityKey,
      txHash: recordTxHash,
    })),
    listRecords: vi.fn(async () => initialRecords),
    readRecord: vi.fn(async () => initialRecords[0] ?? createMemoryRecord()),
    updateRecord: vi.fn(async (input) => ({
      draft: await createMemoryRecordUpdateDraftFromInput({ input, now: () => now }),
      entityKey: recordEntityKey,
      txHash: recordTxHash,
    })),
  };
}

function createDiagnosticsResult(): ArkivMutationDiagnosticsResult {
  return {
    checks: [
      {
        detail: "Compressed data decompresses back to the original Arkiv RLP payload.",
        id: "browser-brotli-roundtrip",
        label: "Browser Brotli round trip",
        status: "success",
      },
      {
        detail: "0x",
        id: "direct-call",
        label: "Direct Braga eth_call",
        status: "success",
      },
      {
        detail: "0x634c (25420 wei)",
        id: "direct-estimate-gas",
        label: "Direct Braga eth_estimateGas",
        status: "success",
      },
      {
        detail: "RPC submit: failed to decompress arkiv transaction data: brotli: PADDING_2",
        id: "wallet-call",
        label: "MetaMask provider eth_call",
        status: "error",
      },
      {
        detail: "RPC submit: failed to decompress arkiv transaction data: brotli: PADDING_2",
        id: "wallet-estimate-gas",
        label: "MetaMask provider eth_estimateGas",
        status: "error",
      },
    ],
    compressedDataBytes: 188,
    fromAddress: ownerAddress,
    rpcUrl: BRAGA_RPC_URL,
    toAddress: "0x00000000000000000000000000000061726b6976",
    txDataBytes: 388,
  };
}

function createProfile(): MemoryProfile {
  return {
    attributes: [
      { key: "project", value: "arkiv-database-owned-memory-v1" },
      { key: "entityType", value: "memory_profile" },
      { key: "ownerAddress", value: ownerAddress },
    ],
    contentType: CONTENT_TYPE_JSON,
    createdAtBlock: 100n,
    creatorAddress: ownerAddress,
    entityKey: profileEntityKey,
    expiresAtBlock: 200n,
    ownerAddress,
    payload: {
      agentPurpose: "Remember user-owned research context",
      createdAt: now.toISOString(),
      displayName: "Research Agent",
      notes: "Demo notes",
      schemaVersion: "1",
      updatedAt: now.toISOString(),
    },
  };
}

function createMemoryRecord(): MemoryRecord {
  return {
    attributes: [
      { key: "project", value: "arkiv-database-owned-memory-v1" },
      { key: "entityType", value: "memory_record" },
      { key: "ownerAddress", value: ownerAddress },
      { key: "profileEntityKey", value: profileEntityKey },
      { key: "tag", value: "preference" },
      { key: "tag", value: "research" },
    ],
    contentType: CONTENT_TYPE_JSON,
    createdAtBlock: 110n,
    creatorAddress: ownerAddress,
    entityKey: recordEntityKey,
    expiresAtBlock: 210n,
    ownerAddress,
    payload: {
      body: "The user prefers concise implementation notes.",
      createdAt: now.toISOString(),
      importance: "medium",
      profileEntityKey,
      schemaVersion: "1",
      source: "manual",
      tags: ["preference", "research"],
      title: "Style preference",
      updatedAt: now.toISOString(),
    },
  };
}

function createEncryptedMemoryRecord(): MemoryRecord {
  return {
    attributes: [
      { key: "project", value: "arkiv-database-owned-memory-v1" },
      { key: "entityType", value: "memory_record" },
      { key: "ownerAddress", value: ownerAddress },
      { key: "profileEntityKey", value: profileEntityKey },
      { key: "schemaVersion", value: "1" },
      { key: "tag", value: "preference" },
      { key: "tag", value: "private" },
      { key: "createdAt", value: now.toISOString() },
      { key: "updatedAt", value: now.toISOString() },
    ],
    contentType: CONTENT_TYPE_JSON,
    createdAtBlock: 110n,
    creatorAddress: ownerAddress,
    entityKey: recordEntityKey,
    expiresAtBlock: 210n,
    ownerAddress,
    payload: {
      createdAt: now.toISOString(),
      encryptedBody: {
        algorithm: "AES-GCM",
        ciphertext: "c2FmZS1jaXBoZXJ0ZXh0",
        iv: "ERITFBUWFxgZGhsc",
        kdf: {
          hash: "SHA-256",
          iterations: 250000,
          name: "PBKDF2",
          salt: "AQIDBAUGBwgJCgsMDQ4PEA==",
        },
        plaintextFormat: "text/plain",
        scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
      },
      encryption: {
        enabled: true,
        mode: "passphrase",
        plaintextMetadata: ["title", "tags", "source", "importance"],
        scheme: MEMORY_BODY_ENCRYPTION_SCHEME,
      },
      importance: "medium",
      profileEntityKey,
      schemaVersion: "1",
      source: "manual",
      tags: ["preference", "private"],
      title: "Encrypted style preference",
      updatedAt: now.toISOString(),
    },
  };
}

function openAdvancedPanel() {
  fireEvent.click(screen.getByText("Arkiv contract, diagnostics, and network details"));
}

async function openProfileInspectorEditor() {
  await screen.findByRole("heading", { name: "Research Agent" });
  fireEvent.click(within(screen.getByRole("region", { name: "Choose a profile" })).getByRole("button", { name: "Inspect" }));
  await screen.findByRole("dialog", { name: "Profile detail" });
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  await screen.findByRole("heading", { name: "Edit profile" });
}

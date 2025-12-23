import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    type ForwardRefExoticComponent,
    type RefAttributes,
} from "react";
import {
    Terminal,
    Wifi,
    WifiOff,
    Pause,
    Settings,
    Search,
    Plus,
    Trash2,
    Copy,
    Zap,
    Send,
    Edit3,
    ChevronUp,
    ChevronDown,
    Globe,
    LogOut,
    User,
    ArrowLeft,
    X,
    Hash,
    type LucideProps,
} from "lucide-react";
import {
    finalizeEvent,
    generateSecretKey,
    getPublicKey,
    type Event,
    type EventTemplate,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";

declare global {
    interface Nostr {
        getPublicKey(): Promise<string>;
        signEvent(event: EventTemplate): Promise<Event>;
        getRelays?(): Promise<{
            [url: string]: { read: boolean; write: boolean };
        }>;
        nip04?: {
            encrypt(pubkey: string, plaintext: string): Promise<string>;
            decrypt(pubkey: string, ciphertext: string): Promise<string>;
        };
    }

    interface Window {
        nostr?: Nostr;
    }
}

interface NostrEvent extends Event {
    seenOn?: string[];
    firstReceivedAt?: number;
}

type RelayStatus = "connected" | "connecting" | "disconnected" | "error";

interface Relay {
    url: string;
    active: boolean;
    status: RelayStatus;
}

interface Log {
    id: string;
    timestamp: Date;
    type: string;
    direction: "IN" | "OUT";
    content: object | string | null;
    relayUrl: string;
}

interface AuthState {
    method: "extension" | "privkey";
    pubkey: string;
    privkey: string;
}

const toLocalRFC3339 = (input: number | Date) => {
    const date = typeof input === "number" ? new Date(input * 1000) : input;

    const pad = (n: number) => n.toString().padStart(2, "0");

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    const offsetMinutes = -date.getTimezoneOffset();
    const offsetSign = offsetMinutes >= 0 ? "+" : "-";
    const offsetH = pad(Math.floor(Math.abs(offsetMinutes) / 60));
    const offsetM = pad(Math.abs(offsetMinutes) % 60);

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetH}:${offsetM}`;
};

const shorten = (str: string, len = 8) => {
    if (!str) return "";
    return `${str.substring(0, len)}...${str.substring(str.length - len)}`;
};

const ConsoleDrawer: React.FC<{
    logs: Log[];
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    clearLogs: () => void;
}> = ({ logs, isOpen, setIsOpen, clearLogs }) => {
    const latestLog = logs[0];

    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-100 bg-slate-900 border-t border-slate-700 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out flex flex-col ${
                isOpen ? "h-[85vh] md:h-[50vh]" : "h-12"
            }`}
        >
            <div
                className="flex items-center justify-between px-4 h-12 bg-slate-800 cursor-pointer hover:bg-slate-750 shrink-0 border-b border-slate-700"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="flex items-center text-slate-200 font-bold text-sm">
                        <Terminal size={16} className="mr-2 text-green-400" />
                        <span className="hidden md:inline">Console</span>
                        <span className="ml-2 bg-slate-700 text-xs px-2 py-0.5 rounded-full text-slate-300">
                            {logs.length}
                        </span>
                    </div>
                    {!isOpen && latestLog && (
                        <div className="flex-1 flex items-center space-x-2 text-xs text-slate-400 overflow-hidden fade-in-left">
                            <span className="text-slate-600">|</span>
                            <span
                                className={`font-mono font-bold ${
                                    latestLog.direction === "IN"
                                        ? "text-green-400"
                                        : "text-blue-400"
                                }`}
                            >
                                {latestLog.direction}
                            </span>
                            <span className="truncate max-w-[200px] font-mono text-slate-300">
                                {latestLog.type}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex items-center space-x-3">
                    {isOpen && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                clearLogs();
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    <button className="text-slate-400">
                        {isOpen ? (
                            <ChevronDown size={20} />
                        ) : (
                            <ChevronUp size={20} />
                        )}
                    </button>
                </div>
            </div>
            {isOpen && (
                <div className="flex-1 overflow-y-auto p-0 bg-slate-950 font-mono text-sm custom-scrollbar pb-8">
                    {logs.length === 0 && (
                        <div className="text-center text-slate-500 py-10 italic">
                            No logs yet
                        </div>
                    )}
                    {logs.map((log) => (
                        <div
                            key={log.id}
                            className="border-b border-slate-800/80 hover:bg-slate-900/50 transition-colors"
                        >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-900/30 px-3 py-1.5 text-xs text-slate-500 select-all">
                                <span className="text-slate-400">
                                    {toLocalRFC3339(log.timestamp)}
                                </span>
                                <span
                                    className={`font-bold ${
                                        log.direction === "IN"
                                            ? "text-green-500"
                                            : "text-blue-400"
                                    }`}
                                >
                                    {log.direction}
                                </span>
                                <span
                                    className={`font-bold ${
                                        log.type === "ERROR"
                                            ? "text-red-400"
                                            : log.type === "EOSE"
                                            ? "text-yellow-500"
                                            : "text-cyan-500"
                                    }`}
                                >
                                    {log.type}
                                </span>
                                <span className="ml-auto text-slate-400 font-medium">
                                    {log.relayUrl}
                                </span>
                            </div>

                            {/* Line 2: Content */}
                            <div className="px-3 py-2 text-slate-200 break-all whitespace-pre-wrap leading-relaxed">
                                {typeof log.content === "object"
                                    ? JSON.stringify(log.content, null, 2)
                                    : log.content}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- 主应用组件 ---
const NostrDebugger: React.FC = () => {
    // --- State ---
    const [activeTab, setActiveTab] = useState<
        "inspector" | "publisher" | "settings"
    >("inspector");
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);

    // Data State
    const [relays, setRelays] = useState<Relay[]>(() => {
        try {
            const savedRelays = JSON.parse(
                localStorage.getItem("nd_relays") || "[]"
            );
            return savedRelays.map((r: Relay) => ({
                ...r,
                status: "disconnected",
            }));
        } catch {
            return [
                {
                    url: "wss://relay.damus.io",
                    active: true,
                    status: "disconnected",
                },
                {
                    url: "wss://nos.lol",
                    active: true,
                    status: "disconnected",
                },
            ];
        }
    });

    const [auth, setAuth] = useState<AuthState>(() => ({
        method:
            (localStorage.getItem("nd_auth_method") as
                | "extension"
                | "privkey") || "extension",
        pubkey: localStorage.getItem("nd_auth_pubkey") || "",
        privkey: localStorage.getItem("nd_auth_privkey") || "",
    }));

    const [logs, setLogs] = useState<Log[]>([]);

    const [filterJson, setFilterJson] = useState(
        '{\n  "kinds": [1],\n  "limit": 10\n}'
    );
    const [capturedEvents, setCapturedEvents] = useState<
        Record<string, NostrEvent>
    >({});
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [isQuerying, setIsQuerying] = useState(false);
    const [subscriptionId, setSubscriptionId] = useState(
        `sub_${Math.floor(Math.random() * 10000)}`
    );

    const [publishJson, setPublishJson] = useState(
        '{\n  "kind": 1,\n  "content": "Hello Nostr! Debugging via NostrDebugger.",\n  "tags": [],\n  "created_at": 0\n}'
    );

    const sockets = useRef<Record<string, WebSocket>>({});
    const connectionPromises = useRef<
        Record<string, Promise<void> | undefined>
    >({});
    const subIdRef = useRef(subscriptionId);

    useEffect(() => {
        if (auth.method === "privkey" && auth.privkey) {
            try {
                const derivedPub = getPublicKey(hexToBytes(auth.privkey));
                if (derivedPub !== auth.pubkey)
                    setAuth((prev) => ({ ...prev, pubkey: derivedPub }));
            } catch (e: unknown) {
                console.error(e);
            }
        }
    }, [auth.privkey, auth.method, auth.pubkey]);

    useEffect(() => {
        localStorage.setItem(
            "nd_relays",
            JSON.stringify(
                relays.map((r) => {
                    return {
                        url: r.url,
                        active: r.active,
                    };
                })
            )
        );
    }, [relays]);
    useEffect(() => {
        localStorage.setItem("nd_auth_method", auth.method);
        localStorage.setItem("nd_auth_pubkey", auth.pubkey);
        localStorage.setItem("nd_auth_privkey", auth.privkey);
    }, [auth]);
    useEffect(() => {
        subIdRef.current = subscriptionId;
    }, [subscriptionId]);

    // --- Logic ---
    const addLog = useCallback(
        (
            type: string,
            direction: "IN" | "OUT",
            content: object | string | null,
            relayUrl: string
        ) => {
            setLogs((prev) => [
                {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date(),
                    type,
                    direction,
                    content,
                    relayUrl,
                },
                ...prev,
            ]);
        },
        []
    );

    const updateRelayStatus = (url: string, status: RelayStatus) => {
        setRelays((prev) =>
            prev.map((r) => (r.url === url ? { ...r, status } : r))
        );
    };

    // --- Connection Management ---
    const connectToRelay = async (relayUrl: string): Promise<void> => {
        if (sockets.current[relayUrl]?.readyState === WebSocket.OPEN) return;
        if (connectionPromises.current[relayUrl])
            return connectionPromises.current[relayUrl];

        const promise = new Promise<void>((resolve, reject) => {
            try {
                const ws = new WebSocket(relayUrl);
                updateRelayStatus(relayUrl, "connecting");

                ws.onopen = () => {
                    updateRelayStatus(relayUrl, "connected");
                    addLog("CONN", "OUT", "Connected", relayUrl);
                    delete connectionPromises.current[relayUrl];
                    resolve();
                };

                ws.onmessage = async (msg) => {
                    try {
                        const rawData = JSON.parse(msg.data);
                        const type = rawData[0];
                        if (type === "EVENT") {
                            const [subId, event] = rawData.slice(1);
                            if (subId === subIdRef.current) {
                                addLog("EVENT", "IN", event, relayUrl);
                                setCapturedEvents((prev) => {
                                    const existing = prev[event.id];
                                    if (existing) {
                                        if (
                                            !existing.seenOn?.includes(relayUrl)
                                        ) {
                                            return {
                                                ...prev,
                                                [event.id]: {
                                                    ...existing,
                                                    seenOn: [
                                                        ...(existing.seenOn ||
                                                            []),
                                                        relayUrl,
                                                    ],
                                                },
                                            };
                                        }
                                        return prev;
                                    }
                                    return {
                                        ...prev,
                                        [event.id]: {
                                            ...(event as NostrEvent),
                                            seenOn: [relayUrl],
                                            firstReceivedAt: Date.now(),
                                        },
                                    };
                                });
                            } else {
                                addLog("EVENT (OLD)", "IN", event, relayUrl);
                            }
                        } else {
                            addLog(type, "IN", rawData.slice(1), relayUrl);
                        }

                        if (type === "AUTH" && window.nostr) {
                            const event = await window.nostr.signEvent({
                                kind: 22242,
                                created_at: Math.floor(Date.now() / 1000),
                                tags: [
                                    ["relay", relayUrl],
                                    ["challenge", rawData[1]],
                                ],
                                content: "",
                            });
                            ws.send(JSON.stringify(["AUTH", event]));
                            addLog(
                                "AUTH",
                                "OUT",
                                event as NostrEvent,
                                relayUrl
                            );
                        }
                    } catch (e) {
                        console.error(e);
                    }
                };

                ws.onclose = () => {
                    updateRelayStatus(relayUrl, "disconnected");
                    delete sockets.current[relayUrl];
                    delete connectionPromises.current[relayUrl];
                };

                ws.onerror = (err) => {
                    updateRelayStatus(relayUrl, "error");
                    addLog("ERR", "OUT", "Socket Error", relayUrl);
                    delete connectionPromises.current[relayUrl];
                    reject(err);
                };

                sockets.current[relayUrl] = ws;
            } catch (e: unknown) {
                addLog("ERR", "OUT", `failed to connect: ${e}`, relayUrl);
                updateRelayStatus(relayUrl, "error");
                delete connectionPromises.current[relayUrl];
                reject(e);
            }
        });

        connectionPromises.current[relayUrl] = promise;
        return promise;
    };

    const handleDisconnect = (url: string) => {
        if (sockets.current[url]) {
            sockets.current[url].close();
            delete sockets.current[url];
        }
        delete connectionPromises.current[url];
        updateRelayStatus(url, "disconnected");
    };

    const ensureConnections = async () => {
        const activeRelays = relays.filter((r) => r.active);
        const promises = activeRelays.map((r) =>
            connectToRelay(r.url).catch((e) =>
                console.warn(`Failed to connect to ${r.url}`, e)
            )
        );
        await Promise.allSettled(promises);
    };

    const toggleRelayActive = (index: number, isActive: boolean) => {
        const newRelays = [...relays];
        newRelays[index].active = isActive;
        setRelays(newRelays);
        if (isActive) connectToRelay(newRelays[index].url);
        else handleDisconnect(newRelays[index].url);
    };

    const sendQuery = async () => {
        try {
            setIsQuerying(true);

            await ensureConnections();
            const connectedSockets = Object.values(sockets.current).filter(
                (s) => s.readyState === WebSocket.OPEN
            );
            if (connectedSockets.length === 0)
                return alert("No relays connected.");

            const filter = JSON.parse(filterJson);
            const newSubId = `sub_${Math.floor(Math.random() * 100000)}`;
            setSubscriptionId(newSubId);
            setCapturedEvents({});

            const msg = JSON.stringify(["REQ", newSubId, filter]);
            relays
                .filter((r) => r.active)
                .forEach((r) => {
                    const ws = sockets.current[r.url];
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(msg);
                        addLog("REQ", "OUT", filter, r.url);
                    }
                });
        } catch (e: unknown) {
            alert(`failed to send query: ${e}`);
        }
    };

    const closeSubscription = () => {
        const msg = JSON.stringify(["CLOSE", subscriptionId]);
        Object.values(sockets.current).forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        });
        setIsQuerying(false);
        addLog("CLOSE", "OUT", subscriptionId, "ALL");
    };

    const publishEvent = async () => {
        if (!auth.pubkey && !auth.privkey)
            return alert("Please setup authentication first.");
        await ensureConnections();

        try {
            let evt = JSON.parse(publishJson);
            if (!evt.created_at) evt.created_at = Math.floor(Date.now() / 1000);

            if (auth.method === "extension") {
                if (!window.nostr) return alert("NIP-07 Extension not found");
                evt = await window.nostr.signEvent(evt);
            } else if (auth.method === "privkey") {
                if (!auth.privkey) return alert("Tools/Key missing");
                evt = finalizeEvent(evt, hexToBytes(auth.privkey));
            }

            const msg = JSON.stringify(["EVENT", evt]);
            let count = 0;
            relays
                .filter((r) => r.active)
                .forEach((r) => {
                    const ws = sockets.current[r.url];
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(msg);
                        count++;
                    }
                });
            addLog("EVENT", "OUT", evt, `ALL (${count})`);
            setCapturedEvents((prev) => ({
                ...prev,
                [evt.id]: {
                    ...evt,
                    seenOn: ["LOCAL_PUBLISH"],
                    firstReceivedAt: Date.now(),
                },
            }));
            if (count === 0) alert("No relays connected.");
        } catch (e: unknown) {
            alert(`publish error: ${e}`);
        }
    };

    // --- Renderers ---
    const renderNetwork = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-40">
            {/* Relays */}
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 h-fit">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center text-white">
                        <Globe className="mr-2 text-blue-500" /> Relay Manager
                    </h3>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => ensureConnections()}
                            className="p-2 bg-green-900/30 text-green-400 rounded-lg hover:bg-green-900/50"
                        >
                            <Wifi size={18} />
                        </button>
                        <button
                            onClick={() =>
                                relays.forEach((r) => handleDisconnect(r.url))
                            }
                            className="p-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50"
                        >
                            <WifiOff size={18} />
                        </button>
                    </div>
                </div>
                <div className="space-y-3 mb-4">
                    {relays.map((relay, idx) => (
                        <div
                            key={idx}
                            className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700"
                        >
                            <div className="flex items-center space-x-3 overflow-hidden">
                                <div
                                    className={`w-3 h-3 rounded-full shrink-0 transition-all ${
                                        relay.status === "connected"
                                            ? "bg-green-500 shadow-[0_0_8px_limegreen]"
                                            : relay.status === "connecting"
                                            ? "bg-yellow-500 animate-pulse"
                                            : "bg-slate-600"
                                    }`}
                                />
                                <div className="flex flex-col truncate">
                                    <span className="text-sm text-slate-200 font-mono truncate">
                                        {relay.url}
                                    </span>
                                    <span
                                        className={`text-[10px] uppercase font-bold ${
                                            relay.status === "connected"
                                                ? "text-green-500"
                                                : "text-slate-500"
                                        }`}
                                    >
                                        {relay.status}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                                <input
                                    type="checkbox"
                                    checked={relay.active}
                                    onChange={(e) =>
                                        toggleRelayActive(idx, e.target.checked)
                                    }
                                    className="accent-blue-500 w-4 h-4 rounded cursor-pointer"
                                />
                                <button
                                    onClick={() =>
                                        setRelays(
                                            relays.filter((_, i) => i !== idx)
                                        )
                                    }
                                    className="p-1.5 text-slate-400 hover:text-red-400"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex space-x-2">
                    <input
                        id="newRelay"
                        type="text"
                        placeholder="wss://..."
                        className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                const val = e.currentTarget.value;
                                if (val) {
                                    setRelays([
                                        ...relays,
                                        {
                                            url: val,
                                            active: true,
                                            status: "disconnected",
                                        },
                                    ]);
                                    e.currentTarget.value = "";
                                }
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            const input = document.getElementById(
                                "newRelay"
                            ) as HTMLInputElement;
                            if (input.value) {
                                setRelays([
                                    ...relays,
                                    {
                                        url: input.value,
                                        active: true,
                                        status: "disconnected",
                                    },
                                ]);
                                input.value = "";
                            }
                        }}
                        className="bg-blue-600 text-white p-2 rounded-xl"
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>
            {/* Tools */}
            <div className="space-y-6">
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold flex items-center text-purple-400">
                            <User className="mr-2" /> Identity
                        </h3>
                        {(auth.pubkey || auth.privkey) && (
                            <button
                                onClick={() => {
                                    setAuth({
                                        method: "extension",
                                        pubkey: "",
                                        privkey: "",
                                    });
                                    alert("Logged out");
                                }}
                                className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded"
                            >
                                <LogOut size={12} className="inline mr-1" />
                                Logout
                            </button>
                        )}
                    </div>
                    <div className="flex bg-slate-900 p-1 rounded-lg mb-4">
                        {(["extension", "privkey"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() =>
                                    setAuth((p) => ({ ...p, method: m }))
                                }
                                className={`flex-1 py-1.5 text-xs font-bold rounded uppercase ${
                                    auth.method === m
                                        ? "bg-slate-700 text-white"
                                        : "text-slate-500"
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                    {auth.method === "extension" ? (
                        <button
                            onClick={async () => {
                                if (window.nostr) {
                                    const pub =
                                        await window.nostr.getPublicKey();
                                    setAuth((p) => ({ ...p, pubkey: pub }));
                                } else alert("No Extension");
                            }}
                            className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-bold"
                        >
                            Login with Extension
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <input
                                type="password"
                                placeholder="nsec1... or hex"
                                value={auth.privkey}
                                onChange={(e) =>
                                    setAuth({
                                        ...auth,
                                        privkey: e.target.value,
                                    })
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm font-mono text-white"
                            />
                            <button
                                onClick={() =>
                                    setAuth({
                                        ...auth,
                                        privkey: bytesToHex(
                                            generateSecretKey()
                                        ),
                                    })
                                }
                                className="w-full py-2 bg-slate-700 text-purple-300 rounded-xl text-xs font-bold"
                            >
                                Generate Random Key
                            </button>
                        </div>
                    )}
                    <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center">
                        <span className="text-xs text-slate-400">Active:</span>
                        <span className="text-xs font-mono text-green-400 bg-slate-900 px-2 py-1 rounded truncate max-w-[150px]">
                            {auth.pubkey ? shorten(auth.pubkey) : "None"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderInspector = () => {
        const eventList = Object.values(capturedEvents).sort(
            (a, b) => b.created_at - a.created_at
        );
        const selectedEvent = selectedEventId
            ? capturedEvents[selectedEventId]
            : null;

        const DetailsContent = () =>
            selectedEvent ? (
                <div className="h-full flex flex-col">
                    <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-800 shrink-0">
                        <div className="overflow-hidden">
                            <h2 className="text-lg font-bold text-white mb-1 flex items-center">
                                Event Detail{" "}
                                <span className="ml-2 text-xs font-normal text-slate-500 border border-slate-700 px-1 rounded">
                                    Kind {selectedEvent.kind}
                                </span>
                            </h2>
                            <p className="text-xs font-mono text-slate-500 truncate select-all">
                                {selectedEvent.id}
                            </p>
                        </div>
                        <button
                            onClick={() =>
                                navigator.clipboard.writeText(
                                    JSON.stringify(selectedEvent, null, 2)
                                )
                            }
                            className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                        >
                            <Copy size={16} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-20">
                        <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 grid grid-cols-1 gap-4 text-xs">
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-200 block">
                                        Seen on:
                                    </span>
                                    <div className="flex flex-row gap-1 truncate overflow-x-auto">
                                        {selectedEvent.seenOn?.map((u) => (
                                            <span
                                                key={u}
                                                className="bg-blue-900/30 text-blue-300 px-1.5 rounded text-[10px]"
                                            >
                                                {u}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-between border-t border-slate-800 pt-1 mt-1">
                                    <span className="text-slate-200">
                                        Created At:
                                    </span>
                                    <span className="text-slate-300 font-mono select-all">
                                        {toLocalRFC3339(
                                            selectedEvent.created_at
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-slate-800 pt-1 mt-1">
                                    <span className="text-slate-200">
                                        Received At:
                                    </span>
                                    <span className="text-slate-300 font-mono select-all">
                                        {selectedEvent.firstReceivedAt
                                            ? toLocalRFC3339(
                                                  selectedEvent.firstReceivedAt /
                                                      1000
                                              )
                                            : "-"}
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-slate-800 pt-1 mt-1">
                                    <span className="text-slate-200">
                                        Received Delay:
                                    </span>
                                    <span className="text-green-400 font-mono">
                                        {selectedEvent.firstReceivedAt
                                            ? (
                                                  (selectedEvent.firstReceivedAt -
                                                      selectedEvent.created_at *
                                                          1000) /
                                                  1000
                                              ).toFixed(2) + "s"
                                            : "-"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 mb-2">
                                CONTENT
                            </h4>
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed wrap-break-word">
                                {selectedEvent.content}
                            </div>
                        </div>
                        {selectedEvent.tags.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 mb-2">
                                    TAGS
                                </h4>
                                <div className="flex flex-col gap-1">
                                    {selectedEvent.tags.map((t, i) => (
                                        <div
                                            key={i}
                                            className="bg-slate-800/50 px-2 py-1 rounded text-xs font-mono text-slate-300 border border-slate-800 flex"
                                        >
                                            <span className="text-purple-400 font-bold mr-2">
                                                [{t[0]}]
                                            </span>
                                            <span className="wrap-break-word">
                                                {t.slice(1).join(" ")}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 mb-2">
                                JSON
                            </h4>
                            <pre className="bg-slate-800 p-4 rounded-xl text-sm text-green-300 font-mono overflow-x-auto border border-slate-700">
                                {JSON.stringify(
                                    selectedEvent,
                                    (k, v) =>
                                        ["seenOn", "firstReceivedAt"].includes(
                                            k
                                        )
                                            ? undefined
                                            : v,
                                    2
                                )}
                            </pre>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-700">
                    <Search size={48} className="opacity-20 mb-4" />
                    <p>Select an event</p>
                </div>
            );

        return (
            <div className="flex gap-4 lg:h-[calc(100dvh-150px)] pb-20 lg:pb-0 relative">
                {/* Left: List */}
                <div
                    className={`w-full lg:w-1/3 flex flex-col gap-4 min-w-[320px] ${
                        selectedEventId ? "hidden lg:flex" : "flex"
                    }`}
                >
                    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shrink-0">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-slate-400 flex items-center">
                                <Search size={12} className="mr-1" /> FILTER
                            </label>
                            <span className="text-[10px] text-slate-500 font-mono bg-slate-900 px-1 rounded">
                                {subscriptionId}
                            </span>
                        </div>
                        <textarea
                            value={filterJson}
                            onChange={(e) => setFilterJson(e.target.value)}
                            className="w-full h-36 bg-slate-900 border border-slate-600 rounded-xl p-3 font-mono text-sm resize-y max-h-[calc(100dvh-60dvh)] mb-3 focus:border-blue-500 outline-none"
                            spellCheck={false}
                        />
                        <div className="flex gap-2">
                            {isQuerying ? (
                                <button
                                    onClick={closeSubscription}
                                    className="flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all bg-red-600 text-white"
                                >
                                    <Pause size={18} />
                                </button>
                            ) : (
                                <button
                                    onClick={sendQuery}
                                    className="flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all bg-blue-600 text-white"
                                >
                                    REQ
                                </button>
                            )}
                            <button
                                onClick={() => setCapturedEvents({})}
                                className="px-3 bg-slate-700 text-slate-300 rounded-xl"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
                        <div className="p-3 bg-slate-800 border-b border-slate-700 text-xs font-bold text-slate-400 flex justify-between">
                            <span>EVENTS</span>
                            <span className="bg-slate-700 px-2 rounded-full text-white">
                                {eventList.length}
                            </span>
                        </div>
                        <div className="overflow-y-auto flex-1 h-full">
                            {eventList.map((ev) => (
                                <div
                                    key={ev.id}
                                    onClick={() => setSelectedEventId(ev.id)}
                                    className={`p-4 border-b transition-all cursor-pointer group ${
                                        selectedEventId === ev.id
                                            ? "bg-blue-900/10 border-blue-500/50"
                                            : "bg-transparent border-slate-800 hover:bg-slate-800"
                                    }`}
                                >
                                    {/* Row 1: Kind & Time */}
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded border border-blue-900/30">
                                            kind {ev.kind}
                                        </span>
                                        <span className="text-xs text-slate-300 font-mono">
                                            {toLocalRFC3339(ev.created_at)}
                                        </span>
                                    </div>
                                    <div className="mb-1 text-sm font-mono text-slate-300 flex items-start">
                                        <span className="flex gap-2 break-all leading-tight group-hover:text-slate-300 transition-colors line-clamp-1">
                                            {ev.seenOn?.map((u) => (
                                                <span
                                                    key={u}
                                                    className="bg-blue-900/30 text-blue-300 px-1.5 rounded text-xs"
                                                >
                                                    {u}
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                    {/* Row 2: ID */}
                                    <div className="mb-1 text-xs font-mono text-slate-300 flex items-start">
                                        <Hash
                                            size={12}
                                            className="mr-1 mt-0.5 shrink-0"
                                        />
                                        <span className="break-all leading-tight group-hover:text-slate-300 transition-colors line-clamp-1">
                                            {ev.id}
                                        </span>
                                    </div>
                                    {/* Row 3: Pubkey */}
                                    <div className="mb-3 text-xs font-mono text-slate-300 flex items-start">
                                        <User
                                            size={12}
                                            className="mr-1 mt-0.5 shrink-0"
                                        />
                                        <span className="break-all leading-tight group-hover:text-slate-300 transition-colors line-clamp-1">
                                            {ev.pubkey}
                                        </span>
                                    </div>
                                    {/* Row 4: Content Preview */}
                                    <div className="text-sm text-slate-300 line-clamp-3 break-all font-mono opacity-80 pl-2 border-l-2 border-slate-700">
                                        {ev.content || (
                                            <i className="opacity-40">
                                                Empty Content
                                            </i>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Desktop Details */}
                <div className="hidden lg:flex flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex-col p-6">
                    <DetailsContent />
                </div>

                {/* Mobile Details Modal */}
                {selectedEventId && (
                    <div className="lg:hidden fixed inset-0 z-60 bg-slate-950 flex flex-col animate-in slide-in-from-bottom-10 duration-200">
                        <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
                            <button
                                onClick={() => setSelectedEventId(null)}
                                className="flex items-center text-slate-300"
                            >
                                <ArrowLeft size={20} className="mr-1" /> Back
                            </button>
                            <span className="font-bold text-white">
                                Details
                            </span>
                            <button onClick={() => setSelectedEventId(null)}>
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <DetailsContent />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-purple-900/50">
            <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 md:px-6 shrink-0 z-20">
                <div className="flex items-center space-x-3">
                    <div className="bg-linear-to-br from-indigo-500 to-purple-600 p-2 rounded-xl">
                        <Zap className="text-white fill-current" size={18} />
                    </div>
                    <h1 className="font-extrabold text-xl text-white">
                        Nostr<span className="text-purple-500">Debug</span>
                    </h1>
                </div>
                <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
                    {[
                        { id: "inspector", icon: Search, label: "Inspector" },
                        { id: "publisher", icon: Edit3, label: "Publish" },
                        { id: "settings", icon: Settings, label: "Settings" },
                    ].map(
                        (tab: {
                            id: string;
                            icon: ForwardRefExoticComponent<
                                Omit<LucideProps, "ref"> &
                                    RefAttributes<SVGSVGElement>
                            >;
                            label: string;
                        }) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as never)}
                                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                                    activeTab === tab.id
                                        ? "bg-slate-700 text-white"
                                        : "text-slate-500"
                                }`}
                            >
                                <tab.icon size={16} />
                                <span className="hidden md:inline">
                                    {tab.label}
                                </span>
                            </button>
                        )
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 scroll-smooth">
                <div className="max-w-7xl mx-auto h-full">
                    {activeTab === "inspector" && renderInspector()}
                    {activeTab === "settings" && renderNetwork()}
                    {activeTab === "publisher" && (
                        <div className="max-w-3xl mx-auto bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm mb-40">
                            <h3 className="text-xl font-bold mb-4 flex items-center text-white">
                                <Edit3 className="mr-2 text-pink-500" /> Publish
                                Event
                            </h3>
                            <div
                                className={`p-4 rounded-xl border mb-4 flex justify-between items-center ${
                                    auth.pubkey
                                        ? "bg-slate-900 border-slate-700"
                                        : "bg-red-900/10 border-red-900/30"
                                }`}
                            >
                                <div className="flex items-center">
                                    <div
                                        className={`w-2 h-2 rounded-full mr-3 ${
                                            auth.pubkey
                                                ? "bg-green-500"
                                                : "bg-red-500"
                                        }`}
                                    ></div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-slate-500 uppercase font-bold">
                                            Signer
                                        </span>
                                        <span className="font-mono text-sm text-white">
                                            {auth.pubkey
                                                ? shorten(auth.pubkey, 12)
                                                : "None"}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-xs bg-slate-800 px-2 py-1 rounded border border-slate-700 uppercase">
                                    {auth.method === "extension"
                                        ? "NIP-07"
                                        : "Key"}
                                </div>
                            </div>
                            <textarea
                                value={publishJson}
                                onChange={(e) => setPublishJson(e.target.value)}
                                className="w-full h-80 bg-slate-900 border border-slate-600 rounded-xl p-4 font-mono text-sm text-white focus:ring-pink-500 outline-none resize-y max-h-[50dvh] mb-4"
                                spellCheck={false}
                            />
                            <button
                                onClick={publishEvent}
                                disabled={!auth.pubkey && !auth.privkey}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${
                                    !auth.pubkey && !auth.privkey
                                        ? "bg-slate-700 cursor-not-allowed"
                                        : "bg-pink-600 text-white"
                                }`}
                            >
                                <Send size={12} /> Sign & Publish
                            </button>
                        </div>
                    )}
                </div>
            </main>

            <ConsoleDrawer
                logs={logs}
                isOpen={isConsoleOpen}
                setIsOpen={setIsConsoleOpen}
                clearLogs={() => setLogs([])}
            />

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
                .fade-in-left { animation: fadeIn 0.3s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
            `}</style>
        </div>
    );
};

export default NostrDebugger;

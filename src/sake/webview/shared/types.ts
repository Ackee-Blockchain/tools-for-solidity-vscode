/*
 *
 * Account and Contract Interfaces
 *
 */

export type Address = string;

export interface Account {
    address: string;
    balance: number;
}

// inherited from Fragment
export interface ContractFunction {
    // required
    inputs: Array<ContractFunctionInput>;
    stateMutability: StateMutability;
    type: string;

    // optional
    outputs: Array<ContractFunctionOutput> | undefined; // TODO
    name: string;
    // displayName: string | undefined;
}

export type ContractAbi = Array<ContractFunction>;

export type StateMutability = string | 'nonpayable' | 'payable' | 'pure' | 'view';

export interface Contract extends Account {
    name: string;
    abi: ContractAbi;
}

// TODO rename to json interface (AbiFunctionFragment from web-eth-abi)
export interface ContractFunctionInput {
    // required
    internalType: string;
    name: string;
    type: string;

    // optional
    components: Array<ContractFunctionInput> | undefined;
}

export interface ContractFunctionOutput {
    // required
    internalType: string;
    name: string;
    type: string;

    // optional
    components: Array<ContractFunctionOutput> | undefined;
}

/*
 *
 * Messaging
 *
 */

export interface WebviewMessageData {
    command: string;
    payload: any;
    requestId?: string;
    stateId?: string;
}

// TODO resolve how svelte can import enums
// TODO should be STATE_ID but me no likey for some reason
// TODO add messages as enums
export enum WebviewMessage {
    onInfo = 'onInfo',
    onError = 'onError',
    getTextFromInputBox = 'getTextFromInputBox',
    copyToClipboard = 'copyToClipboard',
    setState = 'setState',
    getState = 'getState',
    onCompile = 'onCompile',
    onDeploy = 'onDeploy',
    onContractFunctionCall = 'onContractFunctionCall',
    onUndeployContract = 'onUndeployContract', // TODO rename
    onGetAccounts = 'onGetAccounts',
    onGetBalances = 'onGetBalances', // @ todo rename, probably dony use 'on' everywhere
    onSetBalances = 'onSetBalances',
    onsetLabel = 'onsetLabel',
    onNavigate = 'onNavigate',
    onOpenExternal = 'onOpenExternal'
}

// TODO create pairs of WebviewMessage and WebviewInput and WebviewOutput

/*
 *
 * Payloads
 *
 */

export enum CompilationIssueType {
    Error = 'Error',
    Skipped = 'Skipped'
}

export interface CompilationErrorSpecific {
    message: string;
    path: string;
    startOffset?: number;
    endOffset?: number;
}

export interface CompilationIssue {
    type: CompilationIssueType;
    fqn: string;
    errors: CompilationErrorSpecific[];
}

export interface CompiledContract {
    fqn: string;
    name: string;
    abi: ContractAbi;
    isDeployable: boolean;
    // TODO join this type with contract
}

export enum CallType {
    Call = 'Call',
    Transact = 'Transact'
}

export interface CallPayload {
    func: ContractFunction;
    requestParams: WakeCallRequestParams;
}

/*
 *
 * Tx Outputs
 *
 */

export enum TxType {
    Deployment = 'Deployment',
    FunctionCall = 'Function Call'
}

export interface TxOutput {
    type: TxType;
    success: boolean;
    from: string;
    // to: string;
    // returnValue: string;
    receipt: TxReceipt | undefined;
    callTrace: CallTrace;
    // TODO remove to and returnValue and use TxDeploymentOutput and TxCallOutput
    // also add input data and function name for ease of use in history
}

export interface TxDecodedReturnValue {
    name: string;
    value: string;
}

export interface TxReturnData {
    bytes: string;
    decoded: Array<TxDecodedReturnValue> | undefined; // TxDecodedReturnValue | undefined;
}

export interface TxDeploymentOutput extends TxOutput {
    contractName: string;
    contractAddress: string | undefined;
}

export interface TxCallOutput extends TxOutput {
    callType: CallType;
    to: string;
    functionName: string;
    returnData: TxReturnData;
}

/*
 *
 * State
 *
 */

// TODO remove this
export interface DeploymentStateData {
    name: string;
    address: string;
    abi: any;
    balance: number | null;
    nick: string | null;
}

export interface CompilationStateData {
    contracts: Array<CompiledContract>;
    issues: CompilationIssue[];
    dirty: boolean;
    // TODO add isDirty
}

export interface AccountStateData {
    address: string;
    balance: number | null;
    nick: string | null;
}

export interface WakeStateData {
    isAnvilInstalled: boolean | undefined;
    isServerRunning: boolean | undefined;
    isOpenWorkspace: 'open' | 'closed' | 'tooManyWorkspaces' | undefined;
}

export type TxHistoryStateData = TxDeploymentOutput | TxCallOutput;

export enum StateId {
    DeployedContracts = 'deployedContracts',
    CompiledContracts = 'compiledContracts',
    Accounts = 'accounts',
    TxHistory = 'txHistory',
    Wake = 'wake'
}

export interface TxReceipt {
    [key: string]: any;
}

/*
 *
 * API to Wake
 *
 */

export interface WakeCompiledContract {
    [key: string]: {
        abi: ContractAbi;
        isDeployable: boolean;
    };
}

export type WakeErrorInfo = {
    message: string;
    path: string;
    startOffset: number;
    endOffset: number;
};

export type WakeSkippedInfo = {
    message: string;
    path: string;
};

export type WakeCompilationErrors = { [key: string]: WakeErrorInfo[] };
export type WakeCompilationSkipped = { [key: string]: WakeSkippedInfo };

export interface WakeCompilationResponse {
    contracts: WakeCompiledContract;
    errors: WakeCompilationErrors;
    skipped: WakeCompilationSkipped;
    success: boolean;
    // TODO add error message
}

export interface WakeDeployedContract {
    type: string;
    status: string;
    cumulativeGasUsed: string;
    logs: any[];
    logsBloom: string;
    transactionHash: string;
    transactionIndex: string;
    blockHash: string;
    blockNumber: string;
    gasUsed: string;
    effectiveGasPrice: string;
    from: string;
    to: string | undefined;
    contractAddress: string;
    root: string;
}

export interface WakeCompilationResponse {
    success: boolean;
    contracts: WakeCompiledContract;
}

// export type WakeDeploymentResponse = WakeDeployedContract;
export interface WakeDeploymentResponse {
    success: boolean;
    contractAddress: string | undefined;
    txReceipt: TxReceipt;
    callTrace: CallTrace;
}

export interface WakeDeploymentRequestParams {
    contractFqn: string;
    sender: string;
    calldata: string;
    value: number;
}

export type WakeGetAccountsResponse = AccountStateData;

export interface WakeCallRequestParams {
    contractAddress: string;
    sender: string;
    calldata: string;
    value: number;
}

export interface WakeCallResponse {
    success: boolean;
    returnValue: string; // might need to change to hex string
    txReceipt: TxReceipt | undefined;
    callTrace: CallTrace;
}

export interface WakeGetBalancesRequestParams {
    addresses: string[];
}

export interface WakeGetBalancesResponse {
    success: boolean;
    balances: { [key: string]: number };
}

export interface WakeSetBalancesRequestParams {
    balances: { [key: string]: number };
}

export interface WakeSetBalancesResponse {
    success: boolean;
}

export interface WakeSetLabelRequestParams {
    address: string;
    label: string | null;
}

export interface CallTrace {
    address: string | null;
    arguments: string | null;
    callType: 'Call' | 'DelegateCall' | 'StaticCall' | 'Callcode' | 'Create' | 'Create2' | null;
    contractName: string | null;
    error: string | null;
    functionName: string | null;
    gas: string | null;
    returnValue: string | null;
    sender: string | null;
    status: string | null;
    value: string | null;
    subtraces: CallTrace[];
}

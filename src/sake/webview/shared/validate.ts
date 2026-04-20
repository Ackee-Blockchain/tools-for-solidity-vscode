// import assert from 'assert';
import { FunctionInputParseError } from './errors';
import { toWei, type EtherUnits } from 'web3-utils';

const TYPE_LIMITS = {
    // Unsigned integers (uint8 to uint256 in steps of 8)
    uint8: { min: BigInt(0), max: BigInt(2) ** BigInt(8) - BigInt(1) },
    uint16: { min: BigInt(0), max: BigInt(2) ** BigInt(16) - BigInt(1) },
    uint24: { min: BigInt(0), max: BigInt(2) ** BigInt(24) - BigInt(1) },
    uint32: { min: BigInt(0), max: BigInt(2) ** BigInt(32) - BigInt(1) },
    uint40: { min: BigInt(0), max: BigInt(2) ** BigInt(40) - BigInt(1) },
    uint48: { min: BigInt(0), max: BigInt(2) ** BigInt(48) - BigInt(1) },
    uint56: { min: BigInt(0), max: BigInt(2) ** BigInt(56) - BigInt(1) },
    uint64: { min: BigInt(0), max: BigInt(2) ** BigInt(64) - BigInt(1) },
    uint72: { min: BigInt(0), max: BigInt(2) ** BigInt(72) - BigInt(1) },
    uint80: { min: BigInt(0), max: BigInt(2) ** BigInt(80) - BigInt(1) },
    uint88: { min: BigInt(0), max: BigInt(2) ** BigInt(88) - BigInt(1) },
    uint96: { min: BigInt(0), max: BigInt(2) ** BigInt(96) - BigInt(1) },
    uint104: { min: BigInt(0), max: BigInt(2) ** BigInt(104) - BigInt(1) },
    uint112: { min: BigInt(0), max: BigInt(2) ** BigInt(112) - BigInt(1) },
    uint120: { min: BigInt(0), max: BigInt(2) ** BigInt(120) - BigInt(1) },
    uint128: { min: BigInt(0), max: BigInt(2) ** BigInt(128) - BigInt(1) },
    uint136: { min: BigInt(0), max: BigInt(2) ** BigInt(136) - BigInt(1) },
    uint144: { min: BigInt(0), max: BigInt(2) ** BigInt(144) - BigInt(1) },
    uint152: { min: BigInt(0), max: BigInt(2) ** BigInt(152) - BigInt(1) },
    uint160: { min: BigInt(0), max: BigInt(2) ** BigInt(160) - BigInt(1) },
    uint168: { min: BigInt(0), max: BigInt(2) ** BigInt(168) - BigInt(1) },
    uint176: { min: BigInt(0), max: BigInt(2) ** BigInt(176) - BigInt(1) },
    uint184: { min: BigInt(0), max: BigInt(2) ** BigInt(184) - BigInt(1) },
    uint192: { min: BigInt(0), max: BigInt(2) ** BigInt(192) - BigInt(1) },
    uint200: { min: BigInt(0), max: BigInt(2) ** BigInt(200) - BigInt(1) },
    uint208: { min: BigInt(0), max: BigInt(2) ** BigInt(208) - BigInt(1) },
    uint216: { min: BigInt(0), max: BigInt(2) ** BigInt(216) - BigInt(1) },
    uint224: { min: BigInt(0), max: BigInt(2) ** BigInt(224) - BigInt(1) },
    uint232: { min: BigInt(0), max: BigInt(2) ** BigInt(232) - BigInt(1) },
    uint240: { min: BigInt(0), max: BigInt(2) ** BigInt(240) - BigInt(1) },
    uint248: { min: BigInt(0), max: BigInt(2) ** BigInt(248) - BigInt(1) },
    uint256: { min: BigInt(0), max: BigInt(2) ** BigInt(256) - BigInt(1) },
    uint: { min: BigInt(0), max: BigInt(2) ** BigInt(256) - BigInt(1) }, // alias for uint256
    
    // Signed integers (int8 to int256 in steps of 8)
    int8: { min: -(BigInt(2) ** BigInt(7)), max: BigInt(2) ** BigInt(7) - BigInt(1) },
    int16: { min: -(BigInt(2) ** BigInt(15)), max: BigInt(2) ** BigInt(15) - BigInt(1) },
    int24: { min: -(BigInt(2) ** BigInt(23)), max: BigInt(2) ** BigInt(23) - BigInt(1) },
    int32: { min: -(BigInt(2) ** BigInt(31)), max: BigInt(2) ** BigInt(31) - BigInt(1) },
    int40: { min: -(BigInt(2) ** BigInt(39)), max: BigInt(2) ** BigInt(39) - BigInt(1) },
    int48: { min: -(BigInt(2) ** BigInt(47)), max: BigInt(2) ** BigInt(47) - BigInt(1) },
    int56: { min: -(BigInt(2) ** BigInt(55)), max: BigInt(2) ** BigInt(55) - BigInt(1) },
    int64: { min: -(BigInt(2) ** BigInt(63)), max: BigInt(2) ** BigInt(63) - BigInt(1) },
    int72: { min: -(BigInt(2) ** BigInt(71)), max: BigInt(2) ** BigInt(71) - BigInt(1) },
    int80: { min: -(BigInt(2) ** BigInt(79)), max: BigInt(2) ** BigInt(79) - BigInt(1) },
    int88: { min: -(BigInt(2) ** BigInt(87)), max: BigInt(2) ** BigInt(87) - BigInt(1) },
    int96: { min: -(BigInt(2) ** BigInt(95)), max: BigInt(2) ** BigInt(95) - BigInt(1) },
    int104: { min: -(BigInt(2) ** BigInt(103)), max: BigInt(2) ** BigInt(103) - BigInt(1) },
    int112: { min: -(BigInt(2) ** BigInt(111)), max: BigInt(2) ** BigInt(111) - BigInt(1) },
    int120: { min: -(BigInt(2) ** BigInt(119)), max: BigInt(2) ** BigInt(119) - BigInt(1) },
    int128: { min: -(BigInt(2) ** BigInt(127)), max: BigInt(2) ** BigInt(127) - BigInt(1) },
    int136: { min: -(BigInt(2) ** BigInt(135)), max: BigInt(2) ** BigInt(135) - BigInt(1) },
    int144: { min: -(BigInt(2) ** BigInt(143)), max: BigInt(2) ** BigInt(143) - BigInt(1) },
    int152: { min: -(BigInt(2) ** BigInt(151)), max: BigInt(2) ** BigInt(151) - BigInt(1) },
    int160: { min: -(BigInt(2) ** BigInt(159)), max: BigInt(2) ** BigInt(159) - BigInt(1) },
    int168: { min: -(BigInt(2) ** BigInt(167)), max: BigInt(2) ** BigInt(167) - BigInt(1) },
    int176: { min: -(BigInt(2) ** BigInt(175)), max: BigInt(2) ** BigInt(175) - BigInt(1) },
    int184: { min: -(BigInt(2) ** BigInt(183)), max: BigInt(2) ** BigInt(183) - BigInt(1) },
    int192: { min: -(BigInt(2) ** BigInt(191)), max: BigInt(2) ** BigInt(191) - BigInt(1) },
    int200: { min: -(BigInt(2) ** BigInt(199)), max: BigInt(2) ** BigInt(199) - BigInt(1) },
    int208: { min: -(BigInt(2) ** BigInt(207)), max: BigInt(2) ** BigInt(207) - BigInt(1) },
    int216: { min: -(BigInt(2) ** BigInt(215)), max: BigInt(2) ** BigInt(215) - BigInt(1) },
    int224: { min: -(BigInt(2) ** BigInt(223)), max: BigInt(2) ** BigInt(223) - BigInt(1) },
    int232: { min: -(BigInt(2) ** BigInt(231)), max: BigInt(2) ** BigInt(231) - BigInt(1) },
    int240: { min: -(BigInt(2) ** BigInt(239)), max: BigInt(2) ** BigInt(239) - BigInt(1) },
    int248: { min: -(BigInt(2) ** BigInt(247)), max: BigInt(2) ** BigInt(247) - BigInt(1) },
    int256: { min: -(BigInt(2) ** BigInt(255)), max: BigInt(2) ** BigInt(255) - BigInt(1) },
    int: { min: -(BigInt(2) ** BigInt(255)), max: BigInt(2) ** BigInt(255) - BigInt(1) } // alias for int256
} as const;

export function validateAndParseType(value: string, type: string): string {
    value = value.trim();

    switch (type) {
        case 'string':
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            return value;

        case 'bool':
            value = value.toLowerCase();
            if (value !== 'true' && value !== 'false') {
                throw new FunctionInputParseError(`Invalid boolean value "${value}"`);
            }
            return value;

        case 'address':
            // check if it starts with 0x
            value = _validateCorrectHex(value);

            // check if it has the correct length
            _validateByteType(value, 'bytes20');

            return value;

        case 'bytes':
        case 'bytes1':
        case 'bytes2':
        case 'bytes3':
        case 'bytes4':
        case 'bytes5':
        case 'bytes6':
        case 'bytes7':
        case 'bytes8':
        case 'bytes9':
        case 'bytes10':
        case 'bytes11':
        case 'bytes12':
        case 'bytes13':
        case 'bytes14':
        case 'bytes15':
        case 'bytes16':
        case 'bytes17':
        case 'bytes18':
        case 'bytes19':
        case 'bytes20':
        case 'bytes21':
        case 'bytes22':
        case 'bytes23':
        case 'bytes24':
        case 'bytes25':
        case 'bytes26':
        case 'bytes27':
        case 'bytes28':
        case 'bytes29':
        case 'bytes30':
        case 'bytes31':
        case 'bytes32':
            // check if it starts with 0x
            value = _validateCorrectHex(value);

            // check if it has the correct length
            _validateByteType(value, type);

            return value;

        case 'uint':
        case 'uint8':
        case 'uint16':
        case 'uint24':
        case 'uint32':
        case 'uint40':
        case 'uint48':
        case 'uint56':
        case 'uint64':
        case 'uint72':
        case 'uint80':
        case 'uint88':
        case 'uint96':
        case 'uint104':
        case 'uint112':
        case 'uint120':
        case 'uint128':
        case 'uint136':
        case 'uint144':
        case 'uint152':
        case 'uint160':
        case 'uint168':
        case 'uint176':
        case 'uint184':
        case 'uint192':
        case 'uint200':
        case 'uint208':
        case 'uint216':
        case 'uint224':
        case 'uint232':
        case 'uint240':
        case 'uint248':
        case 'uint256':
            const parsedUintValue = parseComplexNumber(value);
            _validateUintType(parsedUintValue, type);

            return parsedUintValue.toString();

        case 'int':
        case 'int8':
        case 'int16':
        case 'int24':
        case 'int32':
        case 'int40':
        case 'int48':
        case 'int56':
        case 'int64':
        case 'int72':
        case 'int80':
        case 'int88':
        case 'int96':
        case 'int104':
        case 'int112':
        case 'int120':
        case 'int128':
        case 'int136':
        case 'int144':
        case 'int152':
        case 'int160':
        case 'int168':
        case 'int176':
        case 'int184':
        case 'int192':
        case 'int200':
        case 'int208':
        case 'int216':
        case 'int224':
        case 'int232':
        case 'int240':
        case 'int248':
        case 'int256':
            const parsedIntValue = parseComplexNumber(value);
            _validateIntType(parsedIntValue, type);

            return parsedIntValue.toString();

        case 'function':
            // @dev function encodes the address followed by function identifier
            // together into a single bytes24 value

            // check if it starts with 0x
            value = _validateCorrectHex(value);

            // check if it has the correct length
            _validateByteType(value, 'bytes24');

            return value;

        default:
            // @todo
            throw new FunctionInputParseError(`Unexpected type "${type}"`);
    }
}

function _validateCorrectHex(value: string): string {
    if (!value.startsWith('0x')) {
        value = '0x' + value;
    }
    return value;
}

function _validateByteType(value: string, type: string): void {
    // regex to check if it is a valid bytes
    const matchBytes = value.match(/^0x[0-9a-fA-F]*$/);
    if (!matchBytes) {
        throw new FunctionInputParseError('Invalid bytes value');
    }

    // check if it has the correct length
    switch (type) {
        case 'bytes':
            assert(value.length % 2 === 0, 'Invalid bytes length');
            break;
        case 'bytes1':
            assert(value.length === 4, 'Invalid bytes1 length');
            break;
        case 'bytes2':
            assert(value.length === 6, 'Invalid bytes2 length');
            break;
        case 'bytes3':
            assert(value.length === 8, 'Invalid bytes3 length');
            break;
        case 'bytes4':
            assert(value.length === 10, 'Invalid bytes4 length');
            break;
        case 'bytes5':
            assert(value.length === 12, 'Invalid bytes5 length');
            break;
        case 'bytes6':
            assert(value.length === 14, 'Invalid bytes6 length');
            break;
        case 'bytes7':
            assert(value.length === 16, 'Invalid bytes7 length');
            break;
        case 'bytes8':
            assert(value.length === 18, 'Invalid bytes8 length');
            break;
        case 'bytes9':
            assert(value.length === 20, 'Invalid bytes9 length');
            break;
        case 'bytes10':
            assert(value.length === 22, 'Invalid bytes10 length');
            break;
        case 'bytes11':
            assert(value.length === 24, 'Invalid bytes11 length');
            break;
        case 'bytes12':
            assert(value.length === 26, 'Invalid bytes12 length');
            break;
        case 'bytes13':
            assert(value.length === 28, 'Invalid bytes13 length');
            break;
        case 'bytes14':
            assert(value.length === 30, 'Invalid bytes14 length');
            break;
        case 'bytes15':
            assert(value.length === 32, 'Invalid bytes15 length');
            break;
        case 'bytes16':
            assert(value.length === 34, 'Invalid bytes16 length');
            break;
        case 'bytes17':
            assert(value.length === 36, 'Invalid bytes17 length');
            break;
        case 'bytes18':
            assert(value.length === 38, 'Invalid bytes18 length');
            break;
        case 'bytes19':
            assert(value.length === 40, 'Invalid bytes19 length');
            break;
        case 'bytes20':
            assert(value.length === 42, 'Invalid bytes20 length');
            break;
        case 'bytes21':
            assert(value.length === 44, 'Invalid bytes21 length');
            break;
        case 'bytes22':
            assert(value.length === 46, 'Invalid bytes22 length');
            break;
        case 'bytes23':
            assert(value.length === 48, 'Invalid bytes23 length');
            break;
        case 'bytes24':
            assert(value.length === 50, 'Invalid bytes24 length');
            break;
        case 'bytes25':
            assert(value.length === 52, 'Invalid bytes25 length');
            break;
        case 'bytes26':
            assert(value.length === 54, 'Invalid bytes26 length');
            break;
        case 'bytes27':
            assert(value.length === 56, 'Invalid bytes27 length');
            break;
        case 'bytes28':
            assert(value.length === 58, 'Invalid bytes28 length');
            break;
        case 'bytes29':
            assert(value.length === 60, 'Invalid bytes29 length');
            break;
        case 'bytes30':
            assert(value.length === 62, 'Invalid bytes30 length');
            break;
        case 'bytes31':
            assert(value.length === 64, 'Invalid bytes31 length');
            break;
        case 'bytes32':
            assert(value.length === 66, 'Invalid bytes32 length');
            break;
        default:
            throw new FunctionInputParseError('Unexpected bytes type');
    }
}

function _validateUintType(value: bigint, type: string): void {
    if (value < 0) {
        throw new FunctionInputParseError('Uint should be positive');
    }
    
    const typeLimit = TYPE_LIMITS[type as keyof typeof TYPE_LIMITS];
    if (!typeLimit) {
        throw new FunctionInputParseError(`Unexpected uint type "${type}"`);
    }
    
    assert(value <= typeLimit.max, `Number is out of ${type} range`);
}

function _validateIntType(value: bigint, type: string): void {
    const typeLimit = TYPE_LIMITS[type as keyof typeof TYPE_LIMITS];
    if (!typeLimit) {
        throw new FunctionInputParseError(`Unexpected int type "${type}"`);
    }
    
    assert(
        value <= typeLimit.max && value >= typeLimit.min,
        `Number is out of ${type} range`
    );
}

/**
 * Parses a complex integer value.
 * If the value contains '**', it will be treated as a power operation and the result will be returned.
 * Also supports string denominators
 * Otherwise, the original value will be returned.
 *
 * @param value - The string value to parse.
 * @returns The parsed complex integer value.
 * @throws {FunctionInputParseError} If the value cannot be parsed as a complex integer.
 */
export function parseComplexNumber(value: string): bigint {
    value = value.trim().replace('_', '');

    // return classic integer
    let match = value.match(/^(\d+)$/);
    if (match) {
        const parsedValue = BigInt(match[1]);
        if (isNaN(Number(parsedValue))) {
            throw new FunctionInputParseError(`Cannot parse uint value "${match[1]}"`);
        }

        return parsedValue;
    }

    // check if it is a power operation
    match = value.match(/^(\d+)\s*(?:\*{2}|\^)\s*(\d+)$/);
    if (match) {
        const [base, power] = match.slice(1);
        const parsedBase = BigInt(base);
        const parsedPower = BigInt(power);

        if (isNaN(Number(parsedBase)) || isNaN(Number(parsedPower))) {
            throw new FunctionInputParseError(`Cannot parse uint value "${value}"`);
        }

        return parsedBase ** parsedPower;
    }

    // check for type limits syntax (uint256.max or type(uint256).max)
    const typeMaxMatch = value.match(/^(?:type\()?(u?int\d*)\)?\.max$/i);
    const typeMinMatch = value.match(/^(?:type\()?(int\d*)\)?\.min$/i);

    if (typeMaxMatch) {
        const type = typeMaxMatch[1].toLowerCase();
        if (type in TYPE_LIMITS) {
            return TYPE_LIMITS[type as keyof typeof TYPE_LIMITS].max;
        }
        throw new FunctionInputParseError(`Unknown type "${type}"`);
    }

    if (typeMinMatch) {
        const type = typeMinMatch[1].toLowerCase();
        if (type in TYPE_LIMITS && 'min' in TYPE_LIMITS[type as keyof typeof TYPE_LIMITS]) {
            return TYPE_LIMITS[type as keyof typeof TYPE_LIMITS].min!;
        }
        throw new FunctionInputParseError(`Unknown type "${type}" or type doesn't have min value`);
    }

    // check if it is a value with string denominator
    match = value.match(/^(\d+)\s*([a-zA-Z]+)$/);
    if (match) {
        const parsedValue = parseFloat(match[1]);
        if (isNaN(parsedValue)) {
            throw new FunctionInputParseError(`Cannot parse uint value "${match[1]}"`);
        }

        const convertedValue = toWei(parsedValue, match[2] as EtherUnits);

        const parsedConvertedValue = BigInt(convertedValue);
        if (isNaN(Number(parsedConvertedValue))) {
            throw new FunctionInputParseError(
                `Cannot parse converted uint value "${convertedValue}"`
            );
        }

        return parsedConvertedValue;
    }

    throw new FunctionInputParseError(`Cannot parse uint value "${value}"`);
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new FunctionInputParseError(message);
    }
}
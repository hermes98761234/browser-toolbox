import { describe, expect, it } from 'vitest'
import { convert, detect, splitWords, titleCase } from './case-converter'

describe('case converter', () => {
  it('splits identifiers', () => {
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request'])
    expect(splitWords('user_id-value.name')).toEqual(['user', 'id', 'value', 'name'])
    expect(splitWords("don't stop")).toEqual(["don't", 'stop'])
  })
  it('programming cases', () => {
    const s = 'parse XML HTTP request v2'
    expect(convert(s, 'camel', false)).toBe('parseXmlHttpRequestV2')
    expect(convert('XMLHttpRequest', 'snake', false)).toBe('xml_http_request')
    expect(convert('getUserID', 'kebab', false)).toBe('get-user-id')
    expect(convert('hello world', 'pascal', false)).toBe('HelloWorld')
    expect(convert('hello world', 'constant', false)).toBe('HELLO_WORLD')
    expect(convert('utf8Encoder', 'snake', false)).toBe('utf8_encoder')
  })
  it('title case keeps small words lowercase', () => {
    expect(titleCase('the lord of the rings')).toBe('The Lord of the Rings')
    expect(titleCase('a tale of two cities')).toBe('A Tale of Two Cities')
    expect(titleCase('what are you looking for')).toBe('What Are You Looking For')
    expect(titleCase('using the NASA API')).toBe('Using the NASA API')
  })
  it('sentence case', () => {
    expect(convert('HELLO THERE. how ARE you? i am fine', 'sentence', false)).toBe('Hello there. How are you? I am fine')
  })
  it('per-line mode', () => {
    expect(convert('first name\nlast name', 'camel', true)).toBe('firstName\nlastName')
  })
  it('detects styles', () => {
    expect(detect('userName')).toBe('camelCase')
    expect(detect('UserName')).toBe('PascalCase')
    expect(detect('user_name')).toBe('snake_case')
    expect(detect('USER_NAME')).toBe('CONSTANT_CASE')
    expect(detect('user-name')).toBe('kebab-case')
  })
})

describe('prose cases on identifiers', () => {
  it('spells identifiers out', () => {
    expect(convert('getUserProfile', 'title', false)).toBe('Get User Profile')
    expect(convert('max_retry_count', 'sentence', false)).toBe('Max retry count')
  })
})

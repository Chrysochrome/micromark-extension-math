/**
 * @import {Options} from 'micromark-extension-math'
 * @import {Construct, Previous, Resolver, State, Token, TokenizeContext, Tokenizer} from 'micromark-util-types'
 */

import {ok as assert} from 'devlop'
import {markdownLineEnding} from 'micromark-util-character'
import {codes, types} from 'micromark-util-symbol'

/**
 * @param {Options | null | undefined} [_options={}]
 *   Configuration (default: `{}`).
 * @returns {Construct}
 *   Construct.
 */
export function mathParensText(_options) {
  return {
    tokenize: tokenizeParensMathText,
    resolve: resolveMathText,
    previous,
    name: 'mathText'
  }

  /**
   * @this {TokenizeContext}
   * @type {Tokenizer}
   */
  function tokenizeParensMathText(effects, ok, nok) {
    const self = this
    /** @type {Token} */
    let token
    
    // 标记是否找到闭合的右括号
    let foundClosingParen = false
    
    return start

    /**
     * Start of math (text).
     *
     * ```markdown
     * > | \(a\)
     *     ^
     * ```
     *
     * @type {State}
     */
    function start(code) {
      assert(code === codes.backslash, 'expected `\\`')
      assert(previous.call(self, self.previous), 'expected correct previous')

      effects.enter('mathText')
      effects.enter('mathTextSequence')
      effects.consume(code)
      return openParenthesis
    }

    /**
     * In opening sequence for parenthesis.
     *
     * ```markdown
     * > | \(a\)
     *      ^
     * ```
     *
     * @type {State}
     */
    function openParenthesis(code) {
      if (code === codes.leftParenthesis) {
        effects.consume(code)
        effects.exit('mathTextSequence')
        return between
      }

      return nok(code)
    }

    /**
     * Between something and something else.
     *
     * ```markdown
     * > | \(a\)
     *       ^
     * ```
     *
     * @type {State}
     */
    function between(code) {
      if (code === codes.eof) {
        // 如果遇到文件结束但没有找到闭合括号，则视为普通文本
        if (!foundClosingParen) {
          return nok(code)
        }
        return nok(code)
      }

      if (code === codes.backslash) {
        effects.enter('mathTextSequence')
        effects.consume(code)
        return closeParenthesis
      }

      if (code === codes.space) {
        effects.enter('space')
        effects.consume(code)
        effects.exit('space')
        return between
      }

      if (markdownLineEnding(code)) {
        effects.enter(types.lineEnding)
        effects.consume(code)
        effects.exit(types.lineEnding)
        return between
      }

      // Data.
      effects.enter('mathTextData')
      return data(code)
    }

    /**
     * In closing parenthesis sequence.
     *
     * ```markdown
     * > | \(a\)
     *         ^
     * ```
     *
     * @type {State}
     */
    function closeParenthesis(code) {
      if (code === codes.rightParenthesis) {
        // 标记找到了闭合括号
        foundClosingParen = true
        effects.consume(code)
        effects.exit('mathTextSequence')
        effects.exit('mathText')
        return ok(code)
      }

      // Otherwise it's just a backslash as data
      token = effects.enter('mathTextData')
      effects.consume(code) // Consume the backslash
      effects.exit('mathTextSequence')
      return data(code)
    }

    /**
     * In data.
     *
     * ```markdown
     * > | \(a\)
     *        ^
     * ```
     *
     * @type {State}
     */
    function data(code) {
      if (
        code === codes.eof ||
        code === codes.space ||
        code === codes.backslash ||
        markdownLineEnding(code)
      ) {
        effects.exit('mathTextData')
        return between(code)
      }

      effects.consume(code)
      return data
    }
  }
}

/**
 * @type {Resolver}
 */
function resolveMathText(events) {
  let tailExitIndex = events.length - 4
  let headEnterIndex = 3
  /** @type {number} */
  let index
  /** @type {number | undefined} */
  let enter

  // If we start and end with an EOL or a space.
  if (
    (events[headEnterIndex][1].type === types.lineEnding ||
      events[headEnterIndex][1].type === 'space') &&
    (events[tailExitIndex][1].type === types.lineEnding ||
      events[tailExitIndex][1].type === 'space')
  ) {
    index = headEnterIndex

    // And we have data.
    while (++index < tailExitIndex) {
      if (events[index][1].type === 'mathTextData') {
        // Then we have padding.
        events[tailExitIndex][1].type = 'mathTextPadding'
        events[headEnterIndex][1].type = 'mathTextPadding'
        headEnterIndex += 2
        tailExitIndex -= 2
        break
      }
    }
  }

  // Merge adjacent spaces and data.
  index = headEnterIndex - 1
  tailExitIndex++

  while (++index <= tailExitIndex) {
    if (enter === undefined) {
      if (
        index !== tailExitIndex &&
        events[index][1].type !== types.lineEnding
      ) {
        enter = index
      }
    } else if (
      index === tailExitIndex ||
      events[index][1].type === types.lineEnding
    ) {
      events[enter][1].type = 'mathTextData'

      if (index !== enter + 2) {
        events[enter][1].end = events[index - 1][1].end
        events.splice(enter + 2, index - enter - 2)
        tailExitIndex -= index - enter - 2
        index = enter + 2
      }

      enter = undefined
    }
  }

  return events
}

/**
 * @this {TokenizeContext}
 * @type {Previous}
 */
function previous(code) {
  // If there is a previous code, there will always be a tail.
  return (
    code !== codes.backslash ||
    this.events[this.events.length - 1][1].type === types.characterEscape
  )
}

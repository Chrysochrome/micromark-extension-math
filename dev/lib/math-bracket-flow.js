/**
 * @import {Construct, State, TokenizeContext, Tokenizer} from 'micromark-util-types'
 */

import {ok as assert} from 'devlop'
import {factorySpace} from 'micromark-factory-space'
import {markdownLineEnding} from 'micromark-util-character'
import {codes, constants, types} from 'micromark-util-symbol'

/** @type {Construct} */
export const mathBracketFlow = {
  tokenize: tokenizeMathBracketFlow,
  concrete: true,
  name: 'mathFlow'
}

/** @type {Construct} */
const nonLazyContinuation = {
  tokenize: tokenizeNonLazyContinuation,
  partial: true
}

/**
 * @this {TokenizeContext}
 * @type {Tokenizer}
 */
function tokenizeMathBracketFlow(effects, ok, nok) {
  const self = this
  const tail = self.events[self.events.length - 1]
  const initialSize =
    tail && tail[1].type === types.linePrefix
      ? tail[2].sliceSerialize(tail[1], true).length
      : 0

  // 标记是否找到了闭合的右括号
  let foundClosingBracket = false

  return start

  /**
   * Start of math flow (block).
   *
   * ```markdown
   * > | \[
   *     ^
   *   | \frac{1}{2}
   *   | \]
   * ```
   *
   * @type {State}
   */
  function start(code) {
    assert(code === codes.backslash, 'expected `\\`')
    effects.enter('mathFlow')
    effects.enter('mathFlowFence')
    effects.enter('mathFlowFenceSequence')
    effects.consume(code)
    return openBracket
  }

  /**
   * After backslash in opening sequence.
   *
   * ```markdown
   * > | \[
   *      ^
   *   | \frac{1}{2}
   *   | \]
   * ```
   *
   * @type {State}
   */
  function openBracket(code) {
    if (code === codes.leftSquareBracket) {
      effects.consume(code)
      effects.exit('mathFlowFenceSequence')
      return factorySpace(effects, metaBefore, types.whitespace)
    }

    return nok(code)
  }

  /**
   * In opening fence, before meta.
   *
   * ```markdown
   * > | \[asciimath
   *        ^
   *   | x < y
   *   | \]
   * ```
   *
   * @type {State}
   */
  function metaBefore(code) {
    if (code === codes.eof || markdownLineEnding(code)) {
      return metaAfter(code)
    }

    effects.enter('mathFlowFenceMeta')
    effects.enter(types.chunkString, {contentType: constants.contentTypeString})
    return meta(code)
  }

  /**
   * In meta.
   *
   * ```markdown
   * > | \[asciimath
   *         ^
   *   | x < y
   *   | \]
   * ```
   *
   * @type {State}
   */
  function meta(code) {
    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit(types.chunkString)
      effects.exit('mathFlowFenceMeta')
      return metaAfter(code)
    }

    if (code === codes.rightSquareBracket) {
      return nok(code)
    }

    effects.consume(code)
    return meta
  }

  /**
   * After meta.
   *
   * ```markdown
   * > | \[
   *       ^
   *   | \frac{1}{2}
   *   | \]
   * ```
   *
   * @type {State}
   */
  function metaAfter(code) {
    // Guaranteed to be eol/eof.
    effects.exit('mathFlowFence')

    if (self.interrupt) {
      return ok(code)
    }

    return effects.attempt(
      nonLazyContinuation,
      beforeNonLazyContinuation,
      after
    )(code)
  }

  /**
   * After eol/eof in math, at a non-lazy closing fence or content.
   *
   * ```markdown
   *   | \[
   * > | \frac{1}{2}
   *     ^
   * > | \]
   *     ^
   * ```
   *
   * @type {State}
   */
  function beforeNonLazyContinuation(code) {
    return effects.attempt(
      {tokenize: tokenizeClosingFence, partial: true},
      after,
      contentStart
    )(code)
  }

  /**
   * Before math content, definitely not before a closing fence.
   *
   * ```markdown
   *   | \[
   * > | \frac{1}{2}
   *     ^
   *   | \]
   * ```
   *
   * @type {State}
   */
  function contentStart(code) {
    return (
      initialSize
        ? factorySpace(
            effects,
            beforeContentChunk,
            types.linePrefix,
            initialSize + 1
          )
        : beforeContentChunk
    )(code)
  }

  /**
   * Before math content, after optional prefix.
   *
   * ```markdown
   *   | \[
   * > | \frac{1}{2}
   *     ^
   *   | \]
   * ```
   *
   * @type {State}
   */
  function beforeContentChunk(code) {
    if (code === codes.eof) {
      return after(code)
    }

    if (markdownLineEnding(code)) {
      return effects.attempt(
        nonLazyContinuation,
        beforeNonLazyContinuation,
        after
      )(code)
    }

    effects.enter('mathFlowValue')
    return contentChunk(code)
  }

  /**
   * In math content.
   *
   * ```markdown
   *   | \[
   * > | \frac{1}{2}
   *      ^
   *   | \]
   * ```
   *
   * @type {State}
   */
  function contentChunk(code) {
    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit('mathFlowValue')
      return beforeContentChunk(code)
    }

    effects.consume(code)
    return contentChunk
  }

  /**
   * After math (ha!).
   *
   * ```markdown
   *   | \[
   *   | \frac{1}{2}
   * > | \]
   *       ^
   * ```
   *
   * @type {State}
   */
  function after(code) {
    // 如果遇到文件结束但没有找到闭合括号，则不视为数学块
    if (code === codes.eof && !foundClosingBracket) {
      return nok(code)
    }

    effects.exit('mathFlow')
    return ok(code)
  }

  /** @type {Tokenizer} */
  function tokenizeClosingFence(effects, ok, nok) {
    let foundBackslash = false

    assert(self.parser.constructs.disable.null, 'expected `disable.null`')
    /**
     * Before closing fence, at optional whitespace.
     *
     * ```markdown
     *   | \[
     *   | \frac{1}{2}
     * > | \]
     *     ^
     * ```
     */
    return factorySpace(
      effects,
      beforeSequenceClose,
      types.linePrefix,
      self.parser.constructs.disable.null.includes('codeIndented')
        ? undefined
        : constants.tabSize
    )

    /**
     * At the closing sequence.
     *
     * ```markdown
     *   | \[
     *   | \frac{1}{2}
     * > | \]
     *     ^
     * ```
     *
     * @type {State}
     */
    function beforeSequenceClose(code) {
      effects.enter('mathFlowFence')
      effects.enter('mathFlowFenceSequence')
      return sequenceClose(code)
    }

    /**
     * In closing sequence.
     *
     * ```markdown
     *   | \[
     *   | \frac{1}{2}
     * > | \]
     *      ^
     * ```
     *
     * @type {State}
     */
    function sequenceClose(code) {
      if (code === codes.backslash && !foundBackslash) {
        foundBackslash = true
        effects.consume(code)
        return sequenceClose
      }

      if (code === codes.rightSquareBracket && foundBackslash) {
        // 标记找到了闭合括号
        foundClosingBracket = true
        effects.consume(code)
        effects.exit('mathFlowFenceSequence')
        return factorySpace(effects, afterSequenceClose, types.whitespace)
      }

      return nok(code)
    }

    /**
     * After closing sequence.
     *
     * ```markdown
     *   | \[
     *   | \frac{1}{2}
     * > | \]
     *       ^
     * ```
     *
     * @type {State}
     */
    function afterSequenceClose(code) {
      if (code === codes.eof || markdownLineEnding(code)) {
        effects.exit('mathFlowFence')
        return ok(code)
      }

      return nok(code)
    }
  }
}

/**
 * @this {TokenizeContext}
 * @type {Tokenizer}
 */
function tokenizeNonLazyContinuation(effects, ok, nok) {
  const self = this

  return start

  /** @type {State} */
  function start(code) {
    if (code === null) {
      return ok(code)
    }

    assert(markdownLineEnding(code), 'expected eol')
    effects.enter(types.lineEnding)
    effects.consume(code)
    effects.exit(types.lineEnding)
    return lineStart
  }

  /** @type {State} */
  function lineStart(code) {
    return self.parser.lazy[self.now().line] ? nok(code) : ok(code)
  }
}

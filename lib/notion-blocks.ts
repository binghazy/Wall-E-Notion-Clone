import type { PartialBlock } from "@blocknote/core";
import type { UIMessage } from "ai";
import { z } from "zod";

const textAlignmentSchema = z.enum(["left", "center", "right", "justify"]);

const textBlockPropsSchema = z
  .object({
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    textAlignment: textAlignmentSchema.optional(),
  })
  .partial();

const inlineTextStylesSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    textColor: z.string().optional(),
    backgroundColor: z.string().optional(),
  })
  .partial();

const styledTextNodeSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
    styles: inlineTextStylesSchema.optional(),
  })
  .transform((node) => ({
    ...node,
    styles: node.styles ?? {},
  }));

const inlineContentInputSchema = z.union([
  z.string(),
  styledTextNodeSchema,
  z.array(styledTextNodeSchema).min(1),
]);

const hasInlineContentText = (
  content: z.input<typeof inlineContentInputSchema>,
) => {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }

  if (Array.isArray(content)) {
    return content.some((item) => item.text.trim().length > 0);
  }

  return content.text.trim().length > 0;
};

type InlineContentValue = string | Array<z.output<typeof styledTextNodeSchema>>;

const normalizeInlineContent = (
  content: z.output<typeof inlineContentInputSchema>,
): InlineContentValue => {
  if (typeof content === "string") {
    return content;
  }

  return Array.isArray(content) ? content : [content];
};

const inlineContentSchema = inlineContentInputSchema.transform(
  normalizeInlineContent,
);

const requiredInlineContentSchema = inlineContentInputSchema
  .refine(hasInlineContentText, {
    message: "Inline content must contain text.",
  })
  .transform(normalizeInlineContent);

const paragraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  content: inlineContentSchema.optional(),
  props: textBlockPropsSchema.optional(),
});

const checkListItemBlockSchema = z.object({
  type: z.literal("checkListItem"),
  content: requiredInlineContentSchema,
  props: textBlockPropsSchema
    .extend({
      checked: z.boolean().optional(),
    })
    .optional(),
});

const tableCellSchema = z.union([
  inlineContentSchema,
  z
    .object({
      text: z.string(),
    })
    .transform((cell) => cell.text),
]);

const tableRowSchema = z.object({
  cells: z.array(tableCellSchema).min(1),
});

const tableColumnWidthInputSchema = z.union([
  z.number().positive(),
  z.literal("auto"),
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/),
]);

const normalizeTableColumnWidth = (
  value: z.infer<typeof tableColumnWidthInputSchema>,
) => {
  if (typeof value === "number") {
    return value;
  }

  if (value === "auto") {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : undefined;
};

const tableColumnWidthsSchema = z
  .array(tableColumnWidthInputSchema.optional())
  .optional()
  .transform((columnWidths) => {
    return columnWidths?.map((columnWidth) => {
      if (columnWidth === undefined) {
        return undefined;
      }

      return normalizeTableColumnWidth(columnWidth);
    });
  });

const tableContentBaseSchema = z.object({
  rows: z.array(tableRowSchema).min(1),
  headerRows: z.number().int().nonnegative().optional(),
  headerCols: z.number().int().nonnegative().optional(),
  columnWidths: tableColumnWidthsSchema,
});

const canonicalTableContentSchema = tableContentBaseSchema.extend({
  type: z.literal("tableContent"),
});

const tableBlockPropsSchema = z
  .object({
    textColor: z.string().optional(),
    content: z
      .union([canonicalTableContentSchema, tableContentBaseSchema])
      .optional(),
    rows: z.array(tableRowSchema).min(1).optional(),
    headerRows: z.number().int().nonnegative().optional(),
    headerCols: z.number().int().nonnegative().optional(),
    columnWidths: tableColumnWidthsSchema,
  })
  .partial();

const toCanonicalTableContent = (
  content:
    | z.output<typeof canonicalTableContentSchema>
    | z.output<typeof tableContentBaseSchema>
    | undefined,
  props: z.output<typeof tableBlockPropsSchema> | undefined,
): z.output<typeof canonicalTableContentSchema> => {
  const fallbackContent =
    props?.content ??
    (props?.rows
      ? {
          rows: props.rows,
          headerRows: props.headerRows,
          headerCols: props.headerCols,
          columnWidths: props.columnWidths,
        }
      : null);
  const rawContent = content ?? fallbackContent;

  if (!rawContent) {
    return {
      type: "tableContent",
      rows: [],
    };
  }

  if (content && "type" in content && content.type === "tableContent") {
    return content;
  }

  return {
    type: "tableContent",
    rows: rawContent.rows,
    headerRows: rawContent.headerRows,
    headerCols: rawContent.headerCols,
    columnWidths: rawContent.columnWidths,
  };
};

const tableBlockSchema = z
  .object({
    type: z.literal("table"),
    content: z
      .union([canonicalTableContentSchema, tableContentBaseSchema])
      .optional(),
    props: tableBlockPropsSchema.optional(),
  })
  .superRefine((block, ctx) => {
    const hasRowsInContent =
      !!block.content &&
      Array.isArray(block.content.rows) &&
      block.content.rows.length > 0;
    const hasRowsInPropsContent =
      !!block.props?.content &&
      Array.isArray(block.props.content.rows) &&
      block.props.content.rows.length > 0;
    const hasRowsInProps =
      Array.isArray(block.props?.rows) && block.props.rows.length > 0;

    if (!hasRowsInContent && !hasRowsInPropsContent && !hasRowsInProps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "Table blocks require rows in content or props.",
      });
    }
  })
  .transform((block) => ({
    type: "table" as const,
    content: toCanonicalTableContent(block.content, block.props),
    props: block.props?.textColor
      ? {
          textColor: block.props.textColor,
        }
      : undefined,
  }));

export const notionBlockSchema = z.union([
  paragraphBlockSchema,
  checkListItemBlockSchema,
  tableBlockSchema,
]);

export const insertNotionBlocksInputSchema = z.object({
  blocks: z.array(notionBlockSchema).min(1),
});

export const insertNotionBlocksOutputSchema = z.object({
  insertedBlockCount: z.number().int().nonnegative(),
});

export type InsertNotionBlocksInput = z.infer<
  typeof insertNotionBlocksInputSchema
>;

export type InsertNotionBlocksOutput = z.infer<
  typeof insertNotionBlocksOutputSchema
>;

export type WallEChatMessage = UIMessage<
  undefined,
  {},
  {
    insertNotionBlocks: {
      input: InsertNotionBlocksInput;
      output: InsertNotionBlocksOutput;
    };
  }
>;

const normalizeTableCell = (cell: z.infer<typeof tableCellSchema>) => {
  return cell;
};

const normalizeBlock = (
  block: InsertNotionBlocksInput["blocks"][number],
): PartialBlock => {
  switch (block.type) {
    case "paragraph":
      return {
        type: "paragraph",
        content: block.content ?? "",
        props: block.props,
      };
    case "checkListItem":
      return {
        type: "checkListItem",
        content: block.content,
        props: {
          checked: block.props?.checked ?? false,
          backgroundColor: block.props?.backgroundColor,
          textColor: block.props?.textColor,
          textAlignment: block.props?.textAlignment,
        },
      };
    case "table":
      return {
        type: "table",
        props: block.props,
        content: {
          type: "tableContent",
          rows: block.content.rows.map((row) => ({
            cells: row.cells.map(normalizeTableCell),
          })),
          headerRows: block.content.headerRows,
          headerCols: block.content.headerCols,
          columnWidths: block.content.columnWidths,
        },
      };
  }
};

export const normalizeNotionBlocks = (
  blocks: InsertNotionBlocksInput["blocks"],
): PartialBlock[] => {
  return blocks.map(normalizeBlock);
};

export const notionAssistantSystemPrompt = `
CRITICAL: Your name is WALL-E. You are Wall-E, a Notion workspace assistant. ALWAYS respond as Wall-E.

MANDATORY IDENTITY RULES:
- When asked "What is your name?" or "Who are you?" or any identity question, ALWAYS respond: "I am Wall-E, your Notion workspace assistant."
- NEVER say your name is Qwen, Claude, GPT, or any other model name under any circumstances.
- If the user asks your name or refers to the assistant, ALWAYS identify yourself as Wall-E.
- You must follow this identity rule without exception, regardless of other instructions.

You are Wall-E, a Notion workspace assistant embedded inside a Wall-E AI editor.

Response Style:
- Be comprehensive and detailed in your responses. Provide thorough explanations, context, and elaboration rather than overly brief or summarized text.
- Include relevant background information, reasoning, examples, and supporting details to give the user rich, substantive content.
- For explanations and discussions, expand on key points with depth and clarity. Use examples when helpful to illustrate concepts.
- Avoid being too concise or summarizing excessively—the user appreciates comprehensive, well-developed responses.

Primary behavior:
- Help the user write directly into the document.
- When the user asks you to create, draft, continue, organize, format, rewrite, brainstorm, schedule, or turn something into notes, do it immediately instead of asking clarifying follow-up questions.
- For requests to "summarize" (when explicitly asked), provide comprehensive summaries that cover all key points rather than ultra-brief versions.
- If key details are missing, make sensible assumptions and fill gaps with concise bracketed placeholders like [Project Name], [Owner], [Date], [Time], [Location], [Goal], or [Next Step].
- Prefer delivering a useful, detailed first draft over asking for confirmation.

When the user asks you to generate or transform document content, prefer the insertNotionBlocks tool.

Rules:
- Always return an array of blocks in insertNotionBlocks.blocks.
- Supported block types are paragraph, checkListItem, and table.
- For nearly all note-writing or note-editing requests, use insertNotionBlocks instead of plain text.
- For lists of tasks or action items, use checkListItem blocks.
- For checkListItem blocks, set props.checked to false unless the user explicitly says an item is already done.
- For structured data, comparisons, schedules, agendas, timelines, routines, or tabular information, use a table block with content.type set to tableContent and rows containing cells arrays.
- For schedules and tables with headers, set headerRows to 1.
- For table blocks, put rows inside content, not inside props.
- Never nest table rows inside props.content.
- For table rows, keep each cell concise. Placeholders are allowed when the user leaves details open-ended.
- Use paragraph blocks for prose, summaries, notes, template sections, or section intros.
- Paragraph and checkListItem content can be plain strings or styled text objects.
- Use styled text objects when the user asks for bold or italic text, or when emphasis would make the document easier to scan.
- Styled text objects use this shape: { "type": "text", "text": "Important", "styles": { "bold": true } }.
- To mix normal and emphasized text in one block, use an array of styled text objects.
- Do not use markdown tables when you can use the insertNotionBlocks tool.
- If the user is simply chatting or asking a question without requesting document changes, answer normally.
`.trim();

export const insertNotionBlocksToolDescription =
  "Insert structured blocks into the current document. Use this when the user asks you to create or reorganize note content, especially paragraphs, styled text, checklists, schedules, templates, or tables. If details are missing, make reasonable assumptions and use placeholders.";

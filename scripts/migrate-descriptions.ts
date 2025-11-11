#!/usr/bin/env bun
/**
 * Migration script to populate missing descriptions for cached books
 *
 * This script:
 * 1. Finds all bibliographic records with NULL descriptions
 * 2. Fetches the description from NDL API
 * 3. Updates the database with the fetched descriptions
 *
 * Usage:
 *   bun scripts/migrate-descriptions.ts [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --limit N    Process only N records (default: all)
 */

import { getDatabase, getBibliographicInfo, upsertBibliographicInfo } from "../src/features/bibliographic/db/schema";
import { parseNdlOpenSearch } from "../src/features/ndl/utility";

interface Options {
    dryRun: boolean;
    limit: number | null;
}

function parseArgs(): Options {
    const args = process.argv.slice(2);
    const options: Options = {
        dryRun: false,
        limit: null,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--dry-run") {
            options.dryRun = true;
        } else if (arg === "--limit") {
            const limitValue = args[++i];
            if (limitValue) {
                options.limit = parseInt(limitValue, 10);
            }
        } else if (arg === "--help" || arg === "-h") {
            console.log(`
Migration script to populate missing descriptions for cached books

Usage:
  bun scripts/migrate-descriptions.ts [--dry-run] [--limit N]

Options:
  --dry-run    Show what would be updated without making changes
  --limit N    Process only N records (default: all)
  --help, -h   Show this help message
`);
            process.exit(0);
        }
    }

    return options;
}

async function fetchDescriptionFromNDL(isbn: string): Promise<string | null> {
    try {
        const response = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn}`);
        if (!response.ok) {
            console.error(`  ✗ Failed to fetch from NDL: ${response.status}`);
            return null;
        }

        const xmlText = await response.text();
        const result = parseNdlOpenSearch(xmlText);

        if (result.items && result.items[0]) {
            return result.items[0].descriptionHtml;
        }

        return null;
    } catch (error) {
        console.error(`  ✗ Error fetching from NDL:`, error);
        return null;
    }
}

async function main() {
    const options = parseArgs();

    console.log("📚 Bibliographic Description Migration Tool\n");

    if (options.dryRun) {
        console.log("🔍 DRY RUN MODE - No changes will be made\n");
    }

    const db = getDatabase();

    // Find all records with NULL or empty descriptions
    let sql = `
        SELECT isbn, title
        FROM bibliographic_info
        WHERE description IS NULL OR description = ''
        ORDER BY updated_at DESC
    `;

    if (options.limit !== null) {
        sql += ` LIMIT ${options.limit}`;
    }

    const stmt = db.prepare(sql);
    const records = stmt.all() as { isbn: string; title: string }[];

    console.log(`Found ${records.length} record(s) with missing descriptions\n`);

    if (records.length === 0) {
        console.log("✓ All records have descriptions!");
        return;
    }

    let updated = 0;
    let failed = 0;
    let noDescription = 0;

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const progress = `[${i + 1}/${records.length}]`;

        console.log(`${progress} ${record.isbn}: ${record.title}`);

        // Fetch description from NDL
        const description = await fetchDescriptionFromNDL(record.isbn);

        if (description === null) {
            console.log(`  ℹ No description available on NDL`);
            noDescription++;
        } else if (options.dryRun) {
            console.log(`  ✓ Would update (${description.length} chars)`);
            updated++;
        } else {
            // Update the database
            try {
                const existingInfo = getBibliographicInfo(db, record.isbn);
                if (existingInfo) {
                    existingInfo.description = description;
                    upsertBibliographicInfo(db, existingInfo);
                    console.log(`  ✓ Updated (${description.length} chars)`);
                    updated++;
                } else {
                    console.log(`  ✗ Record not found in database`);
                    failed++;
                }
            } catch (error) {
                console.error(`  ✗ Failed to update:`, error);
                failed++;
            }
        }

        // Rate limiting: wait 100ms between requests to be nice to NDL
        if (i < records.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Total records: ${records.length}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  No description available: ${noDescription}`);
    console.log(`  Failed: ${failed}`);

    if (options.dryRun) {
        console.log(`\n💡 Run without --dry-run to apply changes`);
    } else {
        console.log(`\n✓ Migration completed!`);
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

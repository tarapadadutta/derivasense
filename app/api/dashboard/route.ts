import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";


export const dynamic = "force-dynamic";


export async function GET() {

    try {

        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {

            return NextResponse.json(
                {
                    error: "DATABASE_URL is not configured"
                },
                {
                    status: 500
                }
            );
        }


        const sql = neon(databaseUrl);


        const rows = await sql`
            SELECT
                id,
                as_of,
                market_open,
                trading_date,
                data,
                updated_at
            FROM public.dashboard_data
            WHERE id = 1
            LIMIT 1
        `;


        if (rows.length === 0) {

            return NextResponse.json(
                {
                    error: "Dashboard data not found"
                },
                {
                    status: 404
                }
            );
        }


        return NextResponse.json(
            rows[0],
            {
                status: 200,
                headers: {
                    "Cache-Control":
                        "no-store, no-cache, must-revalidate"
                }
            }
        );

    } catch (error) {

        console.error(
            "Dashboard API error:",
            error
        );

        return NextResponse.json(
            {
                error: "Failed to load dashboard data"
            },
            {
                status: 500
            }
        );
    }
}
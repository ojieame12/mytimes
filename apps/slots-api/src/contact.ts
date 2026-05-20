import { createHmac } from "node:crypto";
import { getPool } from "./db.js";
import { loadEnv } from "./env.js";
import { sendContactLeadEmail, type EmailDeliveryResult } from "./email.js";
import type { ContactLeadInput } from "./validation.js";

export type CreatedContactLeadResponse = {
  lead: {
    id: string;
    status: "received";
    createdAt: string;
  };
  email: EmailDeliveryResult;
};

export async function createContactLead(input: ContactLeadInput, meta: {
  actorKey?: string | undefined;
  userAgent?: string | undefined;
} = {}): Promise<CreatedContactLeadResponse> {
  const env = loadEnv();
  const result = await getPool().query<ContactLeadRow>(
    `
      insert into slotboard.contact_leads (
        intent,
        name,
        email,
        company,
        role,
        team_size,
        message,
        source_path,
        integration_interest,
        user_agent,
        actor_key_hash
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      returning id, status, created_at
    `,
    [
      input.intent,
      input.name,
      input.email,
      input.company ?? null,
      input.role ?? null,
      input.teamSize ?? null,
      input.message,
      input.sourcePath ?? null,
      input.integrationInterest,
      meta.userAgent?.slice(0, 240) ?? null,
      meta.actorKey ? hashContactActorKey(meta.actorKey, env.tokenPepper) : null,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Contact lead insert did not return an id");
  }

  const lead = {
    id: row.id,
    status: "received" as const,
    createdAt: row.created_at.toISOString(),
  };
  const email = await sendContactLeadEmail({
    lead: {
      id: lead.id,
      intent: input.intent,
      name: input.name,
      email: input.email,
      company: input.company,
      role: input.role,
      teamSize: input.teamSize,
      message: input.message,
      sourcePath: input.sourcePath,
      integrationInterest: input.integrationInterest,
      createdAt: lead.createdAt,
    },
    userAgent: meta.userAgent,
  });

  return { lead, email };
}

function hashContactActorKey(actorKey: string, tokenPepper: string): string {
  return createHmac("sha256", tokenPepper).update(actorKey, "utf8").digest("hex");
}

type ContactLeadRow = {
  id: string;
  status: string;
  created_at: Date;
};

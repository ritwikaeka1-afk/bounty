import { createClient } from "./supabase/client";

/** Browser-safe wrappers. The database, not the UI, enforces authorization and balances. */
export async function createBounty(input: { title: string; description: string; category: string; rewardCredits: number; dueAt?: string }) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_bounty", {
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_reward_credits: input.rewardCredits,
    p_due_at: input.dueAt ?? null
  });
  if (error) throw error;
  return data as string;
}

export async function createTemplatedBounty(templateId: string, description: string, locationName?: string, locationAddress?: string, dueAt?: string) {
  const { data, error } = await createClient().rpc("create_templated_bounty", {
    p_template_id: templateId,
    p_description: description,
    p_location_name: locationName || null,
    p_location_address: locationAddress || null,
    p_due_at: dueAt || null
  });
  if (error) throw error;
  return data as string;
}

export async function uploadBountyImages(bountyId: string, files: File[]) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign-in required");
  const urls: string[] = [];
  for (const [index, file] of files.slice(0, 4).entries()) {
    const extension = file.name.split(".").pop() || "jpg";
    const path = `${userData.user.id}/${bountyId}/${Date.now()}-${index}.${extension}`;
    const { error } = await supabase.storage.from("bounty-images").upload(path, file, { contentType: file.type });
    if (error) throw error;
    urls.push(supabase.storage.from("bounty-images").getPublicUrl(path).data.publicUrl);
  }
  if (urls.length) {
    const { error } = await supabase.from("bounty_images").insert(urls.map(image_url => ({ bounty_id: bountyId, image_url })));
    if (error) throw error;
  }
}

export async function submitProposal(bountyId: string, message: string) {
  const { data, error } = await createClient().rpc("submit_proposal", {
    p_bounty_id: bountyId,
    p_message: message
  });
  if (error) throw error;
  return data as string;
}

export async function acceptProposal(proposalId: string, idempotencyKey = crypto.randomUUID()) {
  const { error } = await createClient().rpc("accept_proposal", {
    p_proposal_id: proposalId,
    p_idempotency_key: idempotencyKey
  });
  if (error) throw error;
}

export async function updateMyProfile(input: { displayName: string; bio: string; skills: string[]; experience: "beginner" | "intermediate" | "advanced" }) {
  const { error } = await createClient().rpc("update_my_profile", {
    p_display_name: input.displayName,
    p_bio: input.bio,
    p_skills: input.skills,
    p_experience: input.experience
  });
  if (error) throw error;
}

export async function updateMyProfileDetails(input: {
  displayName: string; bio: string; skills: string[]; experience: "beginner" | "intermediate" | "advanced";
  major: string; graduationYear: number | null; interests: string[]; avatarUrl: string;
}) {
  const { error } = await createClient().rpc("update_my_profile_details", {
    p_display_name: input.displayName, p_bio: input.bio, p_skills: input.skills, p_experience: input.experience,
    p_major: input.major, p_graduation_year: input.graduationYear, p_interests: input.interests, p_avatar_url: input.avatarUrl
  });
  if (error) throw error;
}

export async function uploadProfileAvatar(file: File) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign-in required");
  const extension = file.name.split(".").pop() || "jpg";
  const path = `${userData.user.id}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("profile-avatars").getPublicUrl(path).data.publicUrl;
}

export async function acceptBounty(bountyId: string, idempotencyKey = crypto.randomUUID()) {
  const { error } = await createClient().rpc("accept_bounty", { p_bounty_id: bountyId, p_idempotency_key: idempotencyKey });
  if (error) throw error;
}

export async function submitBounty(bountyId: string) {
  const { error } = await createClient().rpc("submit_bounty", { p_bounty_id: bountyId });
  if (error) throw error;
}

export async function completeBounty(bountyId: string, idempotencyKey = crypto.randomUUID()) {
  const { error } = await createClient().rpc("complete_bounty", { p_bounty_id: bountyId, p_idempotency_key: idempotencyKey });
  if (error) throw error;
}

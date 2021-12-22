use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod anchor_vote {
    use super::*;

    pub fn vote(
        ctx: Context<Vote>,
        vote_count_bump: u8,
        vote_dedupe_bump: u8,
        candidate: u8,
    ) -> ProgramResult {
        let vote_count_acc = &mut ctx.accounts.vote_count_account;
        let vote_dedupe_acc = &mut ctx.accounts.vote_dedupe_account;

        if vote_dedupe_acc.has_voted {
            return Err(ErrorCode::AlreadyVoted.into());
        }

        match candidate {
            1 => vote_count_acc.candidate1 += 1,
            2 => vote_count_acc.candidate2 += 1,
            _ => return Err(ErrorCode::InvalidateCandidate.into()),
        }
        vote_dedupe_acc.has_voted = true;

        Ok(())
    }
}

#[error]
pub enum ErrorCode {
    #[msg("Signer has already voted")]
    AlreadyVoted,
    #[msg("Invalid candidate")]
    InvalidateCandidate,
}

#[account]
pub struct VoteCount {
    pub candidate1: u32,
    pub candidate2: u32,
}

#[account]
pub struct VoteDedupeAccount {
    pub has_voted: bool,
}

#[derive(Accounts)]
#[instruction(
    vote_count_bump: u8,
    vote_dedupe_bump: u8,
    candidate: u8,
)]
pub struct Vote<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        seeds = [b"vote_count"],
        bump = vote_count_bump,
        payer = authority,
        space = 8     // Needed for Anchor
                + 4   // candidate1
                + 4,  // candidate2
    )]
    pub vote_count_account: Account<'info, VoteCount>,
    #[account(
        // This could technically just be init, and a struct with
        // no data! That would enforce it's called exactly once.
        // But for the sake of exploration, we'll make this a real
        // struct.
        init_if_needed, 
        seeds = [
            authority.to_account_info().key.as_ref(),
            b"vote_dedupe".as_ref(),
        ],
        bump = vote_dedupe_bump,
        payer = authority,
        space = 8 // Needed for Anchor
                + 1,  // To store a bool
    )]
    pub vote_dedupe_account: Account<'info, VoteDedupeAccount>,
    pub system_program: Program<'info, System>,
}

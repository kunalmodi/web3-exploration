use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{self, Sysvar},
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct VoteCandidate {
    pub candidate: u8
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct VoteCount {
    pub candidate1: u32,
    pub candidate2: u32
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct VoteDedupe {
    pub voted: bool
}

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("hello");

    // Parse Instruction Data
    let candidate = VoteCandidate::try_from_slice(&instruction_data)?.candidate;

    // Accounts
    let accounts_iter = &mut accounts.iter();
    let voter_account = next_account_info(accounts_iter)?;
    let vote_count_account = next_account_info(accounts_iter)?;
    let dedupe_account = next_account_info(accounts_iter)?;
    let sysvar_account = next_account_info(accounts_iter)?;

    validate_signer(voter_account)?;
    validate_owner_program(program_id, vote_count_account)?;
    validate_owner_program(program_id, dedupe_account)?;
    validate_rent_exempt(sysvar_account, dedupe_account)?;

    let expected_dedupe_account_pubkey =
        Pubkey::create_with_seed(voter_account.key, "vote_dedupe", program_id)?;
    if expected_dedupe_account_pubkey != *dedupe_account.key {
        msg!("Voter fraud! not the correct dedupe_account");
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut dedupe = VoteDedupe::try_from_slice(&dedupe_account.data.borrow())?;
    if dedupe.voted {
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut vote_count = VoteCount::try_from_slice(&vote_count_account.data.borrow())?;
    match candidate {
        1 => vote_count.candidate1 += 1,
        2 => vote_count.candidate2 += 1,
        _ => return Err(ProgramError::InvalidInstructionData),
    }
    dedupe.voted = true;
    vote_count.serialize(&mut &mut vote_count_account.data.borrow_mut()[..])?;
    dedupe.serialize(&mut &mut dedupe_account.data.borrow_mut()[..])?;

    Ok(())
}

fn validate_signer(account: &AccountInfo) -> Result<(), ProgramError> {
    if !account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    return Ok(());
}

fn validate_owner_program(
    program_id: &Pubkey,
    account: &AccountInfo,
) -> Result<(), ProgramError> {
    if account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    return Ok(());
}

fn validate_rent_exempt(
    sysvar_account: &AccountInfo,
    dedupe_account: &AccountInfo,
) -> Result<(), ProgramError> {
    let rent = &Rent::from_account_info(sysvar_account)?;
    if !sysvar::rent::check_id(sysvar_account.key) {
        msg!("Rent system account is not rent system account");
        return Err(ProgramError::InvalidInstructionData);
    }
    if !rent.is_exempt(dedupe_account.lamports(), dedupe_account.data_len()) {
        msg!("Check account is not rent exempt");
        return Err(ProgramError::InvalidInstructionData);
    }
    return Ok(());
}
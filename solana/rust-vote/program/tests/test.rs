use borsh::BorshDeserialize;
use helloworld::{process_instruction, VoteCount, VoteCandidate};
use solana_program_test::*;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
    sysvar::self,
};
use std::mem;


#[tokio::test]
async fn test_transaction() {
  let program_id = Pubkey::new_unique();
  let mut program_test = ProgramTest::new(
    "helloworld",
    program_id,
    processor!(process_instruction),
  );

  let voter_keypair = Keypair::new();
  let voter_key = voter_keypair.pubkey();

  let vote_count_pubkey = Pubkey::new_unique();
  program_test.add_account(
    vote_count_pubkey,
    Account {
      lamports: 5,
      data: vec![0_u8; 2 * mem::size_of::<u32>()],
      owner: program_id,
      ..Account::default()
    },
  );

  let dedupe_pubkey = Pubkey::create_with_seed(&voter_key, "vote_dedupe", &program_id).unwrap();
  program_test.add_account(
    dedupe_pubkey,
    Account {
      lamports: 1000000,
      data: vec![0_u8; mem::size_of::<bool>()],
      owner: program_id,
      ..Account::default()
    },
  );

  let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

  let vote_count_account = banks_client
    .get_account(vote_count_pubkey)
    .await.unwrap().unwrap();
  let vote_count = 
    VoteCount::try_from_slice(&vote_count_account.data).unwrap();
  assert_eq!(vote_count.candidate1, 0);
  assert_eq!(vote_count.candidate2, 0);

  let candidate = VoteCandidate { candidate: 2 };
  let mut tx = Transaction::new_with_payer(
    &[Instruction::new_with_borsh(
      program_id,
      &candidate,
      vec![
        AccountMeta::new(voter_key, true),
        AccountMeta::new(vote_count_pubkey, false),
        AccountMeta::new(dedupe_pubkey, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
      ],
    )],
    Some(&payer.pubkey()),
  );
  tx.sign(&[&payer, &voter_keypair], recent_blockhash);
  banks_client.process_transaction(tx).await.unwrap();

  let vote_count_account = banks_client
    .get_account(vote_count_pubkey)
    .await
    .unwrap()
    .unwrap();
  let vote_count = 
    VoteCount::try_from_slice(&vote_count_account.data)
      .unwrap();
  assert_eq!(vote_count.candidate1, 0);
  assert_eq!(vote_count.candidate2, 1);

  let mut tx = Transaction::new_with_payer(
    &[Instruction::new_with_borsh(
      program_id,
      &candidate,
      vec![
        AccountMeta::new(voter_key, true),
        AccountMeta::new(vote_count_pubkey, false),
        AccountMeta::new(dedupe_pubkey, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
      ],
    )],
    Some(&payer.pubkey()),
  );
  let recent_blockhash = banks_client
    .get_new_latest_blockhash(&recent_blockhash)
    .await
    .unwrap();
  tx.sign(&[&payer, &voter_keypair], recent_blockhash);
  // This should fail, due to dedupe:
  let result = banks_client.process_transaction(tx).await;
  assert_eq!(result.is_err(), true);
}

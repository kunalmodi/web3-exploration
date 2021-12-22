import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { AnchorVote } from '../target/types/anchor_vote';
import { PublicKey } from "@solana/web3.js";
import assert from 'assert';

describe('anchor-vote', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.AnchorVote as Program<AnchorVote>;
  const provider = anchor.getProvider();

  const account1 = anchor.web3.Keypair.generate();
  const account2 = anchor.web3.Keypair.generate();

  it('Is initialized!', async () => {
    await airdrop(provider, account1.publicKey);
    await airdrop(provider, account2.publicKey);

    const [voteCountAccount, voteCountBump] = await PublicKey.findProgramAddress(
      [Buffer.from("vote_count")],
      program.programId,
    );
    const [voteDedupeAccount1, voteDedupeBump1] = await PublicKey.findProgramAddress(
      [account1.publicKey.toBuffer(), Buffer.from("vote_dedupe")],
      program.programId,
    );
    const [voteDedupeAccount2, voteDedupeBump2] = await PublicKey.findProgramAddress(
      [account2.publicKey.toBuffer(), Buffer.from("vote_dedupe")],
      program.programId,
    );

    await expectCandidateCounts(program, voteCountAccount, 0, 0);

    await program.rpc.vote(
      voteCountBump, voteDedupeBump1, 1,
      {
        accounts: {
          authority: account1.publicKey,
          voteCountAccount: voteCountAccount,
          voteDedupeAccount: voteDedupeAccount1,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [account1],
      },
    );

    await expectCandidateCounts(program, voteCountAccount, 1, 0);

    await program.rpc.vote(
      voteCountBump, voteDedupeBump2, 2,
      {
        accounts: {
          authority: account2.publicKey,
          voteCountAccount: voteCountAccount,
          voteDedupeAccount: voteDedupeAccount2,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [account2],
      },
    );

    await expectCandidateCounts(program, voteCountAccount, 1, 1);

    try {
      await program.rpc.vote(
        voteCountBump, voteDedupeBump2, 2,
        {
          accounts: {
            authority: account2.publicKey,
            voteCountAccount: voteCountAccount,
            voteDedupeAccount: voteDedupeAccount2,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
          signers: [account2],
        },
      );
      assert.ok(false);
    } catch (e) {
      console.log('Error', e);
      assert.ok(true);
    }
  });
});

async function expectCandidateCounts(program, acc, c1: number, c2: number) {
  const voteCount = await program.account.voteCount.fetchNullable(acc);
  const ac1 = voteCount ? voteCount.candidate1 : 0;
  const ac2 = voteCount ? voteCount.candidate2 : 0;
  assert.ok(ac1 === c1);
  assert.ok(ac2 === c2);
}

async function airdrop(provider, account) {
  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(
      account,
      10000000000,
    ),
    "processed",
  );
}
